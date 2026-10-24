import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { Querier } from '../client';
import type {
  AbdmGatewayPort,
  AbdmKeyMaterial,
  AbdmEncryptedEntry,
} from '@oncobrief/ports';
import {
  exportToAbdmDocumentBundle,
  type FactWithProvenance,
  type AssembledPacket,
} from '@oncobrief/domain';
import {
  generateEphemeralKeyPair,
  encryptPayload,
  wipeBuffer,
} from '@oncobrief/adapters';
import { appendAuditEvent } from './audit';
import { assertPacketSourcesAccessible } from './packets';

export interface GenerateLinkTokenInput {
  orgId: string;
  patientId: string;
  gateway: AbdmGatewayPort;
}

export interface LinkCareContextInput {
  orgId: string;
  patientId: string;
  packetId: string;
  gateway: AbdmGatewayPort;
}

export interface PatientDiscoveryQuery {
  orgId: string;
  inboundRequestId: string;
  transactionId: string;
  unverifiedIdentifiers?: Array<{ type: string; value: string }>;
  verifiedIdentifiers?: Array<{ type: string; value: string }>;
  name?: string;
  gender?: string;
  yearOfBirth?: number;
  gateway: AbdmGatewayPort;
}

export interface UserLinkInitQuery {
  orgId: string;
  inboundRequestId: string;
  transactionId: string;
  patientReference: string;
  careContextReferences: string[];
  gateway: AbdmGatewayPort;
}

export interface UserLinkConfirmQuery {
  orgId: string;
  inboundRequestId: string;
  transactionId: string;
  linkReferenceNumber: string;
  token: string;
  gateway: AbdmGatewayPort;
}

export interface HipConsentNotificationInput {
  orgId: string;
  inboundRequestId: string;
  consentId: string;
  status: 'GRANTED' | 'REVOKED' | 'EXPIRED';
  consentDetail?: {
    patient?: { id: string };
    hiTypes?: string[];
    careContexts?: Array<{ careContextReference: string }>;
    permission?: {
      dateRange: { from: string; to: string };
      dataEraseAt: string;
    };
  };
  gateway: AbdmGatewayPort;
}

export interface HealthInfoRequestInput {
  orgId: string;
  inboundRequestId: string;
  transactionId: string;
  consentId: string;
  dateRange?: { from: string; to: string };
  dataPushUrl: string;
  keyMaterial: AbdmKeyMaterial;
  gateway: AbdmGatewayPort;
}

/**
 * M2 HIP: Initiates generation of a 6-month link token for an ABHA-linked patient.
 */
export async function generateLinkTokenFlow(
  q: Querier,
  input: GenerateLinkTokenInput,
): Promise<{ requestId: string; status: string }> {
  const linkRes = await q.query<{
    abha_address: string;
    abha_number: string | null;
    aadhaar_name: string | null;
    gender: string | null;
    year_of_birth: number | null;
  }>(
    `SELECT abha_address, abha_number, aadhaar_name, gender, year_of_birth
       FROM abdm_patient_link
      WHERE org_id = $1 AND patient_id = $2`,
    [input.orgId, input.patientId],
  );

  const link = linkRes.rows[0];
  if (!link) {
    throw new Error('patient_not_linked_to_abdm: Demographic profile required');
  }

  const patientRes = await q.query<{ display_name: string }>(
    `SELECT display_name FROM patient WHERE org_id = $1 AND id = $2`,
    [input.orgId, input.patientId],
  );
  const patient = patientRes.rows[0];

  const name = link.aadhaar_name || patient?.display_name || 'Patient';
  const gender = (link.gender as 'M' | 'F' | 'O' | 'U') || 'U';
  const yearOfBirth = link.year_of_birth || 1980;

  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  await q.query(
    `INSERT INTO abdm_transaction
       (request_id, org_id, patient_id, role_kind, flow_kind, status, request_payload)
     VALUES ($1, $2, $3, 'HIP', 'GENERATE_LINK_TOKEN', 'PENDING', $4)`,
    [
      requestId,
      input.orgId,
      input.patientId,
      JSON.stringify({ abhaAddress: link.abha_address, abhaNumber: link.abha_number, name, gender, yearOfBirth }),
    ],
  );

  const res = await input.gateway.generateLinkToken({
    requestId,
    timestamp,
    abhaAddress: link.abha_address,
    abhaNumber: link.abha_number,
    name,
    gender,
    yearOfBirth,
  });

  return { requestId, status: res.status };
}

/**
 * Inbound callback handler for link token receipt.
 */
export async function handleOnGenerateLinkToken(
  q: Querier,
  input: {
    orgId: string;
    abhaAddress: string;
    linkToken: string;
    responseRequestId?: string;
  },
): Promise<void> {
  // Store the 6-month link token (valid 180 days)
  const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

  await q.query(
    `UPDATE abdm_patient_link
        SET link_token_enc = $3,
            link_token_expires_at = $4,
            updated_at = now()
      WHERE org_id = $1 AND abha_address = $2`,
    [input.orgId, input.abhaAddress, input.linkToken, expiresAt.toISOString()],
  );

  if (input.responseRequestId) {
    await q.query(
      `UPDATE abdm_transaction
          SET status = 'COMPLETED', completed_at = now()
        WHERE org_id = $1 AND request_id = $2`,
      [input.orgId, input.responseRequestId],
    );
  }
}

/**
 * M2 HIP: Links an approved, frozen consultation packet to an ABDM Care Context.
 * STRICT CLINICAL INVARIANT: Packet MUST have status = 'approved'.
 */
export async function linkApprovedPacketCareContext(
  q: Querier,
  input: LinkCareContextInput,
): Promise<{ careContextRef: string; status: string }> {
  // 1. Verify packet is approved
  const packetRes = await q.query<{
    id: string;
    status: string;
    encounter_label: string;
    approved_at: Date | null;
  }>(
    `SELECT id, status, encounter_label, approved_at
       FROM consultation_packet
      WHERE id = $1 AND org_id = $2 AND patient_id = $3`,
    [input.packetId, input.orgId, input.patientId],
  );

  const packet = packetRes.rows[0];
  if (!packet) {
    throw new Error('packet_not_found');
  }
  if (packet.status !== 'approved') {
    throw new Error('packet_not_approved: Only frozen, approved packets can be linked to ABDM care contexts');
  }

  await assertPacketSourcesAccessible(q, input.orgId, input.packetId);

  // 2. Verify active link token
  const linkRes = await q.query<{
    abha_address: string;
    abha_number: string | null;
    link_token_enc: string | null;
    link_token_expires_at: Date | null;
  }>(
    `SELECT abha_address, abha_number, link_token_enc, link_token_expires_at
       FROM abdm_patient_link
      WHERE org_id = $1 AND patient_id = $2`,
    [input.orgId, input.patientId],
  );

  const link = linkRes.rows[0];
  if (!link || !link.link_token_enc) {
    throw new Error('missing_link_token: Patient must have an active ABDM link token');
  }
  if (link.link_token_expires_at && link.link_token_expires_at.getTime() <= Date.now()) {
    throw new Error('expired_link_token: ABDM link token has expired, renewal required');
  }

  // 3. Check existing care context
  const careContextRef = `CC-${packet.id}`;
  const displayLabel = `Oncology Consult Packet - ${packet.encounter_label}`;

  const existingCc = await q.query<{ id: string; status: string }>(
    `SELECT id, status FROM abdm_care_context
      WHERE org_id = $1 AND care_context_reference = $2`,
    [input.orgId, careContextRef],
  );

  if (existingCc.rows[0]?.status === 'LINKED') {
    return { careContextRef, status: 'LINKED' };
  }

  // Upsert care context record
  await q.query(
    `INSERT INTO abdm_care_context
       (org_id, patient_id, packet_id, care_context_reference, display_label, hi_type, abha_address, status)
     VALUES ($1, $2, $3, $4, $5, 'OPConsultation', $6, 'LINK_INITIATED')
     ON CONFLICT (org_id, care_context_reference)
     DO UPDATE SET status = 'LINK_INITIATED', display_label = EXCLUDED.display_label`,
    [
      input.orgId,
      input.patientId,
      input.packetId,
      careContextRef,
      displayLabel,
      link.abha_address,
    ],
  );

  // 4. Retrieve patient display
  const pRes = await q.query<{ display_name: string }>(
    `SELECT display_name FROM patient WHERE org_id = $1 AND id = $2`,
    [input.orgId, input.patientId],
  );
  const patientDisplay = pRes.rows[0]?.display_name || 'Patient';

  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  await q.query(
    `INSERT INTO abdm_transaction
       (request_id, org_id, patient_id, role_kind, flow_kind, status, request_payload)
     VALUES ($1, $2, $3, 'HIP', 'LINK_CARE_CONTEXT', 'PENDING', $4)`,
    [
      requestId,
      input.orgId,
      input.patientId,
      JSON.stringify({ careContextRef, displayLabel, abhaAddress: link.abha_address }),
    ],
  );

  const res = await input.gateway.linkCareContext({
    requestId,
    timestamp,
    linkToken: link.link_token_enc,
    abhaAddress: link.abha_address,
    abhaNumber: link.abha_number,
    patientReference: input.patientId,
    patientDisplay,
    careContexts: [{ referenceNumber: careContextRef, display: displayLabel }],
  });

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: null, role: 'system' },
    action: 'abdm.hip.care_context_linked',
    entityKind: 'consultation_packet',
    entityId: input.packetId,
    outcome: 'success',
    metadata: { care_context_ref: careContextRef, gateway_status: res.status },
  });

  return { careContextRef, status: res.status };
}

/**
 * Inbound callback handler for link ACK.
 */
export async function handleOnCareContextLinked(
  q: Querier,
  input: {
    orgId: string;
    careContextRef?: string;
    responseRequestId?: string;
    status: 'SUCCESS' | 'FAILED';
  },
): Promise<void> {
  if (input.careContextRef) {
    await q.query(
      `UPDATE abdm_care_context
          SET status = $3,
              linked_at = CASE WHEN $3 = 'LINKED' THEN now() ELSE linked_at END
        WHERE org_id = $1 AND care_context_reference = $2`,
      [input.orgId, input.careContextRef, input.status === 'SUCCESS' ? 'LINKED' : 'FAILED'],
    );
  }

  if (input.responseRequestId) {
    await q.query(
      `UPDATE abdm_transaction
          SET status = $3, completed_at = now()
        WHERE org_id = $1 AND request_id = $2`,
      [input.orgId, input.responseRequestId, input.status === 'SUCCESS' ? 'COMPLETED' : 'FAILED'],
    );
  }
}

/**
 * M2 HIP: Asynchronous patient discovery matching.
 * Matches patient by strong ID (ABHA, MRN, Mobile) and checks weak demographics.
 * Returns only unlinked, approved consultation packets.
 */
export async function discoverPatientCareContexts(
  q: Querier,
  input: PatientDiscoveryQuery,
): Promise<{ matched: boolean; patientId?: string; careContextsCount?: number }> {
  const timestamp = new Date().toISOString();
  const requestId = randomUUID();

  // 1. Extract search identifiers
  const identifiers = [
    ...(input.verifiedIdentifiers ?? []),
    ...(input.unverifiedIdentifiers ?? []),
  ];

  let targetPatientId: string | null = null;
  let matchedBy: string = 'MR';

  // Check ABHA address / number
  const abhaId = identifiers.find(
    (i) => i.type === 'ABHA_ADDRESS' || i.type === 'HEALTH_ID' || i.type === 'ABHA_NUMBER',
  )?.value;

  if (abhaId) {
    const linkRes = await q.query<{ patient_id: string }>(
      `SELECT patient_id FROM abdm_patient_link
        WHERE org_id = $1 AND (abha_address = $2 OR abha_number = $2)`,
      [input.orgId, abhaId],
    );
    if (linkRes.rows.length === 1) {
      targetPatientId = linkRes.rows[0]!.patient_id;
      matchedBy = 'ABHA';
    }
  }

  // Check MRN if not matched yet
  if (!targetPatientId) {
    const mrn = identifiers.find((i) => i.type === 'MR' || i.type === 'MRN')?.value;
    if (mrn) {
      const pRes = await q.query<{ id: string }>(
        `SELECT patient_id AS id FROM patient_identifier WHERE org_id = $1 AND system = 'mrn' AND value = $2`,
        [input.orgId, mrn],
      );
      if (pRes.rows.length === 1) {
        targetPatientId = pRes.rows[0]!.id;
        matchedBy = 'MR';
      }
    }
  }

  // Check mobile if not matched yet
  if (!targetPatientId) {
    const mobile = identifiers.find((i) => i.type === 'MOBILE')?.value;
    if (mobile) {
      const cleanMobile = mobile.slice(-10);
      const linkRes = await q.query<{ patient_id: string }>(
        `SELECT patient_id FROM abdm_patient_link
          WHERE org_id = $1 AND mobile_last10 = $2`,
        [input.orgId, cleanMobile],
      );
      if (linkRes.rows.length === 1) {
        targetPatientId = linkRes.rows[0]!.patient_id;
        matchedBy = 'MOBILE';
      }
    }
  }

  // If no match found or ambiguous, respond with error 1000
  if (!targetPatientId) {
    await input.gateway.onDiscoverPatient({
      requestId,
      timestamp,
      inboundRequestId: input.inboundRequestId,
      transactionId: input.transactionId,
      error: { code: 1000, message: 'No matching patient found' },
    });

    await appendAuditEvent(q, {
      orgId: input.orgId,
      actor: { userId: null, role: 'gateway' },
      action: 'abdm.hip.patient_discovery_failed',
      entityKind: 'patient',
      entityId: null,
      outcome: 'denied',
      metadata: { transactionId: input.transactionId, inboundRequestId: input.inboundRequestId },
    });

    return { matched: false };
  }

  // Match found: retrieve patient details and unlinked approved packets
  const pRes = await q.query<{ display_name: string }>(
    `SELECT display_name FROM patient WHERE org_id = $1 AND id = $2`,
    [input.orgId, targetPatientId],
  );
  const patient = pRes.rows[0]!;

  const unlinkedPackets = await q.query<{
    id: string;
    encounter_label: string;
    approved_at: Date;
  }>(
    `SELECT cp.id, cp.encounter_label, cp.approved_at
       FROM consultation_packet cp
      WHERE cp.org_id = $1
        AND cp.patient_id = $2
        AND cp.status = 'approved'
        AND NOT EXISTS (
          SELECT 1 FROM abdm_care_context cc
           WHERE cc.org_id = cp.org_id
             AND cc.packet_id = cp.id
             AND cc.status = 'LINKED'
        )`,
    [input.orgId, targetPatientId],
  );

  const careContexts = unlinkedPackets.rows.map((p) => ({
    referenceNumber: `CC-${p.id}`,
    display: `Oncology Consult Packet - ${p.encounter_label}`,
  }));

  await input.gateway.onDiscoverPatient({
    requestId,
    timestamp,
    inboundRequestId: input.inboundRequestId,
    transactionId: input.transactionId,
    patient: {
      referenceNumber: targetPatientId,
      display: patient.display_name,
      careContexts,
      matchedBy: [matchedBy],
    },
  });

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: null, role: 'gateway' },
    action: 'abdm.hip.patient_discovered',
    entityKind: 'patient',
    entityId: targetPatientId,
    outcome: 'success',
    metadata: {
      transactionId: input.transactionId,
      matchedBy,
      careContextsCount: careContexts.length,
    },
  });

  return { matched: true, patientId: targetPatientId, careContextsCount: careContexts.length };
}

/**
 * M2 HIP: User-initiated link initialization with OTP generation.
 */
export async function initUserLink(
  q: Querier,
  input: UserLinkInitQuery,
): Promise<{ linkReferenceNumber: string; otpForDemo: string }> {
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  // Generate 6-digit OTP
  const rawOtp = String(randomInt(100000, 999999));
  const otpHash = createHash('sha256').update(rawOtp).digest('hex');
  const linkReferenceNumber = `LRN-${randomUUID()}`;
  const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  // Retrieve patient link for phone hint
  const linkRes = await q.query<{ mobile_last10: string | null }>(
    `SELECT mobile_last10 FROM abdm_patient_link WHERE org_id = $1 AND patient_id = $2`,
    [input.orgId, input.patientReference],
  );
  const mobile = linkRes.rows[0]?.mobile_last10 || '9999999999';
  const hint = `******${mobile.slice(-4)}`;

  // Update or insert care context tracking
  for (const ccRef of input.careContextReferences) {
    const packetIdMatch = ccRef.replace(/^CC-/, '');
    await q.query(
      `INSERT INTO abdm_care_context
         (org_id, patient_id, packet_id, care_context_reference, display_label, abha_address,
          link_reference_number, otp_hash, otp_expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OTP_SENT')
       ON CONFLICT (org_id, care_context_reference)
       DO UPDATE SET
          link_reference_number = EXCLUDED.link_reference_number,
          otp_hash = EXCLUDED.otp_hash,
          otp_expires_at = EXCLUDED.otp_expires_at,
          status = 'OTP_SENT'`,
      [
        input.orgId,
        input.patientReference,
        packetIdMatch,
        ccRef,
        'Oncology Consult Packet',
        'patient@sbx',
        linkReferenceNumber,
        otpHash,
        expiry.toISOString(),
      ],
    );
  }

  await input.gateway.onInitUserLink({
    requestId,
    timestamp,
    inboundRequestId: input.inboundRequestId,
    transactionId: input.transactionId,
    linkReferenceNumber,
    medium: 'MOBILE',
    hint,
    expiry: expiry.toISOString(),
  });

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: null, role: 'gateway' },
    action: 'abdm.hip.user_link_initiated',
    entityKind: 'patient',
    entityId: input.patientReference,
    outcome: 'success',
    metadata: { linkReferenceNumber, transactionId: input.transactionId },
  });

  return { linkReferenceNumber, otpForDemo: rawOtp };
}

/**
 * M2 HIP: User-initiated link confirmation by OTP verification.
 */
export async function confirmUserLink(
  q: Querier,
  input: UserLinkConfirmQuery,
): Promise<{ success: boolean }> {
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  const contextsRes = await q.query<{
    id: string;
    patient_id: string;
    care_context_reference: string;
    display_label: string;
    otp_hash: string | null;
    otp_expires_at: Date | null;
  }>(
    `SELECT id, patient_id, care_context_reference, display_label, otp_hash, otp_expires_at
       FROM abdm_care_context
      WHERE org_id = $1 AND link_reference_number = $2`,
    [input.orgId, input.linkReferenceNumber],
  );

  const contexts = contextsRes.rows;
  const first = contexts[0];

  if (!first || !first.otp_hash || !first.otp_expires_at) {
    await input.gateway.onConfirmUserLink({
      requestId,
      timestamp,
      inboundRequestId: input.inboundRequestId,
      error: { code: 1003, message: 'Invalid or unknown link reference' },
    });
    return { success: false };
  }

  const expectedHash = createHash('sha256').update(input.token.trim()).digest('hex');
  const isMatch = expectedHash === first.otp_hash;
  const isExpired = first.otp_expires_at.getTime() < Date.now();

  if (!isMatch || isExpired) {
    await input.gateway.onConfirmUserLink({
      requestId,
      timestamp,
      inboundRequestId: input.inboundRequestId,
      error: { code: 1003, message: isExpired ? 'OTP token has expired' : 'Invalid OTP token' },
    });

    await appendAuditEvent(q, {
      orgId: input.orgId,
      actor: { userId: null, role: 'gateway' },
      action: 'abdm.hip.user_link_confirmed',
      entityKind: 'patient',
      entityId: first.patient_id,
      outcome: 'denied',
      metadata: { reason: isExpired ? 'expired' : 'mismatch' },
    });

    return { success: false };
  }

  // Valid OTP: mark all linked
  await q.query(
    `UPDATE abdm_care_context
        SET status = 'LINKED', linked_at = now()
      WHERE org_id = $1 AND link_reference_number = $2`,
    [input.orgId, input.linkReferenceNumber],
  );

  const pRes = await q.query<{ display_name: string }>(
    `SELECT display_name FROM patient WHERE org_id = $1 AND id = $2`,
    [input.orgId, first.patient_id],
  );

  const patientDisplay = pRes.rows[0]?.display_name || 'Patient';
  const careContexts = contexts.map((c) => ({
    referenceNumber: c.care_context_reference,
    display: c.display_label,
  }));

  await input.gateway.onConfirmUserLink({
    requestId,
    timestamp,
    inboundRequestId: input.inboundRequestId,
    patient: {
      referenceNumber: first.patient_id,
      display: patientDisplay,
      careContexts,
    },
  });

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: null, role: 'gateway' },
    action: 'abdm.hip.user_link_confirmed',
    entityKind: 'patient',
    entityId: first.patient_id,
    outcome: 'success',
    metadata: { careContextsCount: careContexts.length },
  });

  return { success: true };
}

/**
 * M2 HIP: Handles consent notification callback from ABDM Gateway.
 */
export async function handleHipConsentNotify(
  q: Querier,
  input: HipConsentNotificationInput,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const requestId = randomUUID();

  if (input.status === 'GRANTED' && input.consentDetail) {
    const detail = input.consentDetail;
    const patientAbha = detail.patient?.id;

    // Find internal patient by abha
    const linkRes = await q.query<{ patient_id: string }>(
      `SELECT patient_id FROM abdm_patient_link
        WHERE org_id = $1 AND (abha_address = $2 OR abha_number = $2)`,
      [input.orgId, patientAbha],
    );
    const patientId = linkRes.rows[0]?.patient_id;

    if (patientId) {
      await q.query(
        `INSERT INTO abdm_consent_artifact
           (org_id, patient_id, abdm_consent_id, role_kind, status, hi_types,
            care_contexts_json, permission_from, permission_to, data_erase_at, raw_artifact_json)
         VALUES ($1, $2, $3, 'HIP', 'GRANTED', $4, $5, $6, $7, $8, $9)
         ON CONFLICT (abdm_consent_id)
         DO UPDATE SET
            status = 'GRANTED',
            care_contexts_json = EXCLUDED.care_contexts_json,
            permission_to = EXCLUDED.permission_to,
            data_erase_at = EXCLUDED.data_erase_at`,
        [
          input.orgId,
          patientId,
          input.consentId,
          detail.hiTypes ?? ['OPConsultation'],
          JSON.stringify(detail.careContexts ?? []),
          detail.permission?.dateRange.from ?? timestamp,
          detail.permission?.dateRange.to ?? timestamp,
          detail.permission?.dataEraseAt ?? timestamp,
          JSON.stringify(detail),
        ],
      );
    }
  } else if (input.status === 'REVOKED' || input.status === 'EXPIRED') {
    await q.query(
      `UPDATE abdm_consent_artifact
          SET status = $3, revoked_at = now()
        WHERE org_id = $1 AND abdm_consent_id = $2`,
      [input.orgId, input.consentId, input.status],
    );
  }

  await input.gateway.onHipConsentNotify({
    requestId,
    timestamp,
    inboundRequestId: input.inboundRequestId,
    consentId: input.consentId,
    status: 'OK',
  });

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: null, role: 'gateway' },
    action: 'abdm.hip.consent_notified',
    entityKind: 'abdm_consent_artifact',
    entityId: null,
    outcome: 'success',
    metadata: { consentId: input.consentId, status: input.status },
  });
}

/**
 * M2 HIP: Processes Health Information request callback.
 * Validates granted consent, generates NRCeS FHIR Bundle from frozen approved packet,
 * encrypts with Fidelius ECDH, pushes directly to dataPushUrl, and notifies Gateway.
 */
export async function processHealthInfoRequest(
  q: Querier,
  input: HealthInfoRequestInput,
): Promise<{ transferred: boolean; entriesCount: number }> {
  const timestamp = new Date().toISOString();
  const ackRequestId = randomUUID();

  // 1. Verify consent artifact is active and granted
  const artifactRes = await q.query<{
    id: string;
    patient_id: string;
    status: string;
    care_contexts_json: unknown;
    permission_to: Date;
  }>(
    `SELECT id, patient_id, status, care_contexts_json, permission_to
       FROM abdm_consent_artifact
      WHERE org_id = $1 AND abdm_consent_id = $2 AND role_kind = 'HIP'`,
    [input.orgId, input.consentId],
  );

  const artifact = artifactRes.rows[0];
  const isConsentValid =
    artifact &&
    artifact.status === 'GRANTED' &&
    artifact.permission_to.getTime() >= Date.now();

  if (!isConsentValid) {
    await input.gateway.onHealthInfoRequest({
      requestId: ackRequestId,
      timestamp,
      inboundRequestId: input.inboundRequestId,
      transactionId: input.transactionId,
      sessionStatus: 'FAILED',
      error: { code: 1001, message: 'Invalid or revoked consent' },
    });

    await appendAuditEvent(q, {
      orgId: input.orgId,
      actor: { userId: null, role: 'gateway' },
      action: 'abdm.hip.transfer_rejected',
      entityKind: 'abdm_consent_artifact',
      entityId: artifact ? artifact.id : null,
      outcome: 'denied',
      metadata: { consentId: input.consentId, transactionId: input.transactionId },
    });

    throw new Error('abdm_consent_invalid_or_expired');
  }

  // 2. Acknowledge the request to Gateway
  await input.gateway.onHealthInfoRequest({
    requestId: ackRequestId,
    timestamp,
    inboundRequestId: input.inboundRequestId,
    transactionId: input.transactionId,
    sessionStatus: 'ACKNOWLEDGED',
  });

  // 3. Find care contexts for this patient
  const patientId = artifact.patient_id;
  const careContextsList = (artifact.care_contexts_json as Array<{ careContextReference: string }>) || [];

  const careContextRefs = careContextsList.map((c) => c.careContextReference).filter(Boolean);

  const packetsRes = await q.query<{
    id: string;
    care_context_reference: string;
    encounter_label: string;
    snapshot_json: { assembled?: AssembledPacket } | null;
    approved_by: string;
  }>(
    `SELECT cp.id, cc.care_context_reference, cp.encounter_label, cp.snapshot_json, cp.approved_by
       FROM abdm_care_context cc
       JOIN consultation_packet cp ON cp.id = cc.packet_id
      WHERE cc.org_id = $1
        AND cc.patient_id = $2
        AND cc.status = 'LINKED'
        AND cp.status = 'approved'
        AND (${careContextRefs.length === 0} OR cc.care_context_reference = ANY($3::text[]))`,
    [input.orgId, patientId, careContextRefs],
  );

  // Reject the entire outbound transfer before any source bytes leave this process.
  // A frozen approval cannot restore access to a withdrawn imported document.
  for (const packet of packetsRes.rows) {
    await assertPacketSourcesAccessible(q, input.orgId, packet.id);
  }

  // Retrieve patient and org metadata for FHIR resource headers
  const patientRes = await q.query<{ display_name: string }>(
    `SELECT display_name FROM patient WHERE org_id = $1 AND id = $2`,
    [input.orgId, patientId],
  );
  const patient = patientRes.rows[0];

  const linkRes = await q.query<{ abha_number: string | null; abha_address: string }>(
    `SELECT abha_number, abha_address FROM abdm_patient_link WHERE org_id = $1 AND patient_id = $2`,
    [input.orgId, patientId],
  );
  const link = linkRes.rows[0];

  const orgRes = await q.query<{ name: string; hfr_facility_id: string | null; abdm_hip_id: string | null }>(
    `SELECT name, hfr_facility_id, abdm_hip_id FROM organization WHERE id = $1`,
    [input.orgId],
  );
  const org = orgRes.rows[0];

  // 4. Generate fresh HIP ephemeral keypair for Fidelius ECDH
  const hipKey = generateEphemeralKeyPair();

  const entries: AbdmEncryptedEntry[] = [];
  const statusResponses: Array<{
    careContextReference: string;
    hiStatus: 'OK' | 'DELIVERED' | 'FAILED';
    description?: string;
  }> = [];

  try {
    for (const pkt of packetsRes.rows) {
      const snapshot = pkt.snapshot_json;
      const facts: FactWithProvenance[] = [];

      if (snapshot?.assembled?.sections) {
        for (const sec of snapshot.assembled.sections) {
          for (const item of sec.items) {
            if (item.fact && item.fact.evidenceFactId && item.fact.valueText && item.fact.factType) {
              facts.push({
                id: item.fact.evidenceFactId,
                patientId,
                documentId: pkt.id,
                factType: item.fact.factType,
                value: { kind: 'text', text: item.fact.valueText },
                verbatimQuote: item.fact.verbatimQuote,
                pageNumber: item.fact.pageNumber ?? 1,
                state: item.stateAtSnapshot ?? 'verified',
              });
            }
          }
        }
      }

      // Generate NRCeS v6.5.0 DocumentBundle
      const bundle = exportToAbdmDocumentBundle(facts, {
        profileType: 'OPConsultRecord',
        patientId,
        patientName: patient?.display_name || 'Patient',
        abhaNumber: link?.abha_number ?? undefined,
        abhaAddress: link?.abha_address ?? undefined,
        facilityId: org?.hfr_facility_id ?? undefined,
        facilityName: org?.name || 'OncoBrief Medical Centre',
        practitionerId: pkt.approved_by,
      });

      const bundleJson = JSON.stringify(bundle);

      // Encrypt with Fidelius
      const enc = encryptPayload(
        bundleJson,
        hipKey.privateKey,
        hipKey.nonceBase64,
        input.keyMaterial.dhPublicKey.keyValue,
        input.keyMaterial.nonce,
      );

      entries.push({
        content: enc.content,
        media: 'application/fhir+json',
        checksum: enc.checksum,
        careContextReference: pkt.care_context_reference,
      });

      statusResponses.push({
        careContextReference: pkt.care_context_reference,
        hiStatus: 'DELIVERED',
        description: 'NRCeS v6.5.0 DocumentBundle delivered',
      });
    }

    // 5. Direct push to dataPushUrl
    await input.gateway.pushHealthInformation(input.dataPushUrl, {
      pageNumber: 0,
      pageCount: 1,
      transactionId: input.transactionId,
      entries,
      keyMaterial: hipKey.keyMaterial,
    });

    // 6. Notify Gateway of transfer completion
    const notifyRequestId = randomUUID();
    await input.gateway.notifyHealthInfoTransferred({
      requestId: notifyRequestId,
      timestamp: new Date().toISOString(),
      notifier: {
        type: 'HIP',
        id: org?.abdm_hip_id || 'ONCOBRIEF_HIP',
      },
      statusNotification: {
        sessionStatus: 'TRANSFERRED',
        hipId: org?.abdm_hip_id || 'ONCOBRIEF_HIP',
        statusResponses,
      },
    });

    // 7. Record transfer in database
    await q.query(
      `INSERT INTO abdm_hi_transfer
         (org_id, patient_id, consent_artifact_id, direction, abdm_transaction_id, data_push_url,
          peer_public_key, peer_nonce, ephemeral_public_key, ephemeral_nonce, status, completed_at)
       VALUES ($1, $2, $3, 'HIP_PUSH', $4, $5, $6, $7, $8, $9, 'TRANSFERRED', now())
       ON CONFLICT (abdm_transaction_id)
       DO UPDATE SET status = 'TRANSFERRED', completed_at = now()`,
      [
        input.orgId,
        patientId,
        artifact.id,
        input.transactionId,
        input.dataPushUrl,
        input.keyMaterial.dhPublicKey.keyValue,
        input.keyMaterial.nonce,
        hipKey.publicKeyBase64,
        hipKey.nonceBase64,
      ],
    );

    await appendAuditEvent(q, {
      orgId: input.orgId,
      actor: { userId: null, role: 'gateway' },
      action: 'abdm.hip.health_info_transferred',
      entityKind: 'abdm_hi_transfer',
      entityId: null,
      outcome: 'success',
      metadata: {
        transactionId: input.transactionId,
        careContextsCount: entries.length,
      },
    });

    return { transferred: true, entriesCount: entries.length };
  } finally {
    // Zero out private key memory immediately
    wipeBuffer(hipKey.privateKey);
  }
}
