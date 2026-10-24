import { createHash, randomUUID } from 'node:crypto';
import type { Querier } from '../client';
import type {
  AbdmGatewayPort,
  AbdmDataPushPayload,
  StoragePort,
  OcrPort,
  ExtractionPort,
} from '@oncobrief/ports';
import {
  generateEphemeralKeyPair,
  decryptPayload,
  wipeBuffer,
} from '@oncobrief/adapters';
import { protectTransferKey, unprotectTransferKey } from './abdm-key';
import { appendAuditEvent } from './audit';
import { createDocument, ingestDocument } from './documents';

export interface InitiateHiuConsentInput {
  orgId: string;
  patientId: string;
  userId: string;
  patientAbhaAddress: string;
  hiTypes: string[];
  dateRange: { from: string; to: string };
  dataEraseAt: string;
  hipId?: string | null;
  gateway: AbdmGatewayPort;
}

export interface HiuConsentNotificationInput {
  orgId: string;
  storage?: StoragePort;
  inboundRequestId: string;
  status: 'GRANTED' | 'DENIED' | 'REVOKED' | 'EXPIRED';
  consentRequestId?: string;
  consentArtefacts?: Array<{ id: string }>;
  gateway: AbdmGatewayPort;
}

export interface RequestHealthInfoPullInput {
  orgId: string;
  userId?: string;
  patientId?: string;
  consentId: string;
  dataPushUrl: string;
  gateway: AbdmGatewayPort;
}

export interface ReceiveHealthInfoPushInput {
  orgId: string;
  payload: AbdmDataPushPayload;
  storage: StoragePort;
  ocr: OcrPort;
  extractor: ExtractionPort;
  gateway?: AbdmGatewayPort;
}

export interface PurgeConsentDataInput {
  orgId: string;
  status?: 'REVOKED' | 'EXPIRED';
  userId?: string;
  actorRole?: string;
  consentId: string;
  storage?: StoragePort;
}

/**
 * M3 HIU: Initiates consent request to patient for retrieving health records.
 * RULE: dateRange.to <= now (cannot request future records).
 * RULE: If requesting from all facilities, omit `hip` key entirely.
 */
export async function initiateHiuConsent(
  q: Querier,
  input: InitiateHiuConsentInput,
): Promise<{ consentRequestId: string; abdmRequestId: string }> {
  if (input.gateway.driver === 'simulated') {
    const patient = await q.query<{ is_demo_fixture: boolean }>('SELECT is_demo_fixture FROM patient WHERE id=$1 AND org_id=$2', [input.patientId, input.orgId]);
    if (!patient.rows[0]?.is_demo_fixture || !input.patientAbhaAddress.endsWith('@sbx')) {
      throw new Error('simulation_requires_synthetic_patient_and_sbx_address');
    }
  }
  const now = new Date();
  const toDate = new Date(input.dateRange.to);
  if (toDate.getTime() > now.getTime() + 60_000) {
    throw new Error('invalid_date_range: dateRange.to cannot be in the future');
  }

  const eraseDate = new Date(input.dataEraseAt);
  if (eraseDate.getTime() <= now.getTime()) {
    throw new Error('invalid_data_erase_at: dataEraseAt must be in the future');
  }

  // Retrieve requester details
  const userRes = await q.query<{ display_name: string; hpr_id: string | null }>(
    `SELECT display_name, hpr_id FROM app_user WHERE id = $1`,
    [input.userId],
  );
  const user = userRes.rows[0];
  const requesterName = user?.display_name || 'Dr. Treating Oncologist';

  const consentRecordRes = await q.query<{ id: string }>(
    `INSERT INTO abdm_consent_request
       (org_id, patient_id, status, purpose_code, hi_types,
        permission_from, permission_to, data_erase_at, requested_by)
     VALUES ($1, $2, 'INITIATED', 'CAREMGT', $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.orgId,
      input.patientId,
      input.hiTypes,
      input.dateRange.from,
      input.dateRange.to,
      input.dataEraseAt,
      input.userId,
    ],
  );
  const consentRequestId = consentRecordRes.rows[0]!.id;

  const abdmRequestId = randomUUID();
  const timestamp = now.toISOString();

  await q.query(
    `INSERT INTO abdm_transaction
       (request_id, org_id, patient_id, role_kind, flow_kind, status, request_payload)
     VALUES ($1, $2, $3, 'HIU', 'INITIATE_CONSENT', 'PENDING', $4)`,
    [
      abdmRequestId,
      input.orgId,
      input.patientId,
      JSON.stringify({ consentRequestId, patientAbha: input.patientAbhaAddress, hiTypes: input.hiTypes }),
    ],
  );

  await input.gateway.initiateConsentRequest({
    requestId: abdmRequestId,
    timestamp,
    patientAbhaAddress: input.patientAbhaAddress,
    purposeCode: 'CAREMGT',
    purposeText: 'Care Management',
    hiTypes: input.hiTypes,
    dateRange: input.dateRange,
    dataEraseAt: input.dataEraseAt,
    requester: {
      name: requesterName,
      hprId: user?.hpr_id ?? undefined,
    },
    hipId: input.hipId || null,
  });

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.userId, role: 'clinician' },
    action: 'abdm.hiu.consent_requested',
    entityKind: 'abdm_consent_request',
    entityId: consentRequestId,
    outcome: 'success',
    metadata: { patientAbha: input.patientAbhaAddress, abdmRequestId },
  });

  return { consentRequestId, abdmRequestId };
}

/**
 * Inbound callback handler for consent request ACK (on-init).
 */
export async function handleOnConsentRequestInit(
  q: Querier,
  input: {
    orgId: string;
    responseRequestId: string;
    consentRequestId: string;
  },
): Promise<void> {
  await q.query(
    `UPDATE abdm_consent_request
        SET abdm_consent_request_id = $3,
            status = 'REQUESTED',
            updated_at = now()
      WHERE org_id = $1
        AND (abdm_consent_request_id = $3 OR id IN (
          SELECT (request_payload->>'consentRequestId')::uuid
            FROM abdm_transaction
           WHERE request_id = $2
        ))`,
    [input.orgId, input.responseRequestId, input.consentRequestId],
  );

  await q.query(
    `UPDATE abdm_transaction
        SET status = 'COMPLETED', completed_at = now()
      WHERE org_id = $1 AND request_id = $2`,
    [input.orgId, input.responseRequestId],
  );
}

/**
 * M3 HIU: Handles consent notification (GRANTED, DENIED, REVOKED, EXPIRED).
 * CRITICAL RULE: REVOKED or EXPIRED immediately purges data and ephemeral keys!
 */
export async function handleHiuConsentNotify(
  q: Querier,
  input: HiuConsentNotificationInput,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const requestId = randomUUID();
  const ackList: Array<{ status: 'OK'; consentId: string }> = [];

  if (input.status === 'GRANTED' && input.consentArtefacts) {
    for (const art of input.consentArtefacts) {
      ackList.push({ status: 'OK', consentId: art.id });

      // Find associated consent request
      const reqRes = await q.query<{ id: string; patient_id: string; permission_from: Date; permission_to: Date; data_erase_at: Date; hi_types: string[] }>(
        `SELECT id, patient_id, permission_from, permission_to, data_erase_at, hi_types
           FROM abdm_consent_request
          WHERE org_id = $1
            AND ($2::text IS NULL OR abdm_consent_request_id = $2)
          ORDER BY created_at DESC LIMIT 1`,
        [input.orgId, input.consentRequestId ?? null],
      );
      const req = reqRes.rows[0];

      if (req) {
        await q.query(
          `INSERT INTO abdm_consent_artifact
             (org_id, patient_id, consent_request_id, abdm_consent_id, role_kind,
              status, hi_types, permission_from, permission_to, data_erase_at)
           VALUES ($1, $2, $3, $4, 'HIU', 'GRANTED', $5, $6, $7, $8)
           ON CONFLICT (abdm_consent_id)
           DO UPDATE SET status = 'GRANTED'`,
          [
            input.orgId,
            req.patient_id,
            req.id,
            art.id,
            req.hi_types,
            req.permission_from,
            req.permission_to,
            req.data_erase_at,
          ],
        );

        // Automatically fetch full consent artifact details
        const fetchRequestId = randomUUID();
        await q.query(
          `INSERT INTO abdm_transaction (request_id, org_id, patient_id, role_kind, flow_kind, request_payload)
           VALUES ($1,$2,$3,'HIU','FETCH_CONSENT',$4)`,
          [fetchRequestId, input.orgId, req.patient_id, JSON.stringify({ consentId: art.id })],
        );
        await input.gateway.fetchConsentArtifact({
          requestId: fetchRequestId,
          timestamp,
          consentId: art.id,
        });
      }
    }

    if (input.consentRequestId) {
      await q.query(
        `UPDATE abdm_consent_request
            SET status = 'GRANTED', updated_at = now()
          WHERE org_id = $1 AND abdm_consent_request_id = $2`,
        [input.orgId, input.consentRequestId],
      );
    }
  } else if (input.status === 'DENIED') {
    if (input.consentRequestId) {
      await q.query(
        `UPDATE abdm_consent_request
            SET status = 'DENIED', updated_at = now()
          WHERE org_id = $1 AND abdm_consent_request_id = $2`,
        [input.orgId, input.consentRequestId],
      );
    }
  } else if (input.status === 'REVOKED' || input.status === 'EXPIRED') {
    if (input.consentArtefacts) {
      for (const art of input.consentArtefacts) {
        ackList.push({ status: 'OK', consentId: art.id });
        await purgeConsentData(q, { orgId: input.orgId, consentId: art.id, status: input.status, storage: input.storage });
      }
    }
  }

  // Acknowledge notification to Gateway
  await input.gateway.onHiuConsentNotify({
    requestId,
    timestamp,
    inboundRequestId: input.inboundRequestId,
    acknowledgement: ackList.length > 0 ? ackList : [{ status: 'OK', consentId: 'N/A' }],
  });

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: null, role: 'gateway' },
    action: 'abdm.hiu.consent_notified',
    entityKind: 'abdm_consent_request',
    entityId: null,
    outcome: 'success',
    metadata: { status: input.status, consentRequestId: input.consentRequestId },
  });
}

/**
 * Inbound callback handler for consent artifact fetch (on-fetch).
 */
export async function handleOnFetchConsentArtifact(
  q: Querier,
  input: {
    orgId: string;
    responseRequestId?: string;
    consent: {
      consentDetail: {
        consentId: string;
        hiTypes: string[];
        careContexts?: Array<{ careContextReference: string }>;
        permission: {
          dateRange: { from: string; to: string };
          dataEraseAt: string;
        };
      };
    };
  },
): Promise<void> {
  const detail = input.consent.consentDetail;

  await q.query(
    `UPDATE abdm_consent_artifact
        SET status = 'GRANTED',
            hi_types = $3,
            care_contexts_json = $4,
            permission_from = $5,
            permission_to = $6,
            data_erase_at = $7,
            raw_artifact_json = $8
      WHERE org_id = $1 AND abdm_consent_id = $2`,
    [
      input.orgId,
      detail.consentId,
      detail.hiTypes,
      JSON.stringify(detail.careContexts ?? []),
      detail.permission.dateRange.from,
      detail.permission.dateRange.to,
      detail.permission.dataEraseAt,
      JSON.stringify(detail),
    ],
  );
}

/**
 * M3 HIU: Requests Health Information pull using granted consent artifact.
 * RULE: Copies permission.dateRange verbatim from the fetched consent artifact.
 * RULE: Generates fresh ephemeral Curve25519 keypair and nonces.
 */
export async function requestHealthInfoPull(
  q: Querier,
  input: RequestHealthInfoPullInput,
): Promise<{ transferId: string; abdmRequestId: string }> {
  const artRes = await q.query<{
    id: string;
    patient_id: string;
    status: string;
    permission_from: Date;
    permission_to: Date;
    data_erase_at: Date;
  }>(
    `SELECT id, patient_id, status, permission_from, permission_to, data_erase_at
       FROM abdm_consent_artifact
      WHERE org_id = $1 AND abdm_consent_id = $2 AND role_kind = 'HIU'
        AND ($3::uuid IS NULL OR patient_id=$3)`,
    [input.orgId, input.consentId, input.patientId ?? null],
  );

  const art = artRes.rows[0];
  if (!art) throw new Error('consent_artifact_not_found');
  if (art.status !== 'GRANTED' || art.data_erase_at.getTime() <= Date.now()) {
    throw new Error('consent_expired_or_revoked');
  }

  // Generate ephemeral key pair
  const hiuKey = generateEphemeralKeyPair();
  const encryptedPrivateKey = protectTransferKey(hiuKey.privateKey);
  wipeBuffer(hiuKey.privateKey);

  const transferRes = await q.query<{ id: string }>(
    `INSERT INTO abdm_hi_transfer
       (org_id, patient_id, consent_artifact_id, direction, data_push_url,
        ephemeral_public_key, ephemeral_nonce, ephemeral_private_key_enc, status)
     VALUES ($1, $2, $3, 'HIU_PULL', $4, $5, $6, $7, 'INITIATED')
     RETURNING id`,
    [
      input.orgId,
      art.patient_id,
      art.id,
      input.dataPushUrl,
      hiuKey.publicKeyBase64,
      hiuKey.nonceBase64,
      encryptedPrivateKey,
    ],
  );
  const transferId = transferRes.rows[0]!.id;

  const abdmRequestId = randomUUID();
  const timestamp = new Date().toISOString();

  // Copy permission.dateRange verbatim from artifact
  const dateRange = {
    from: art.permission_from.toISOString(),
    to: art.permission_to.toISOString(),
  };

  await q.query(
    `INSERT INTO abdm_transaction (request_id, org_id, patient_id, role_kind, flow_kind, request_payload)
     VALUES ($1,$2,$3,'HIU','PULL_HEALTH_INFO',$4)`,
    [abdmRequestId, input.orgId, art.patient_id, JSON.stringify({ transferId })],
  );

  await input.gateway.requestHealthInformation({
    requestId: abdmRequestId,
    timestamp,
    consentId: input.consentId,
    dateRange,
    dataPushUrl: input.dataPushUrl,
    keyMaterial: hiuKey.keyMaterial,
  });

  await appendAuditEvent(q, {
    orgId: input.orgId,
    actor: { userId: input.userId ?? null, role: 'clinician' },
    action: 'abdm.hiu.health_info_requested',
    entityKind: 'abdm_hi_transfer',
    entityId: transferId,
    outcome: 'success',
    metadata: { consentId: input.consentId, abdmRequestId },
  });

  return { transferId, abdmRequestId };
}

/**
 * Inbound callback handler for health information request ACK (on-request).
 */
export async function handleOnHealthInfoRequest(
  q: Querier,
  input: {
    orgId: string;
    responseRequestId?: string;
    transactionId: string;
    sessionStatus: string;
    error?: { code: number; message: string };
  },
): Promise<void> {
  const result = await q.query(
    `UPDATE abdm_hi_transfer
        SET abdm_transaction_id = $3, status = $4, error_message = $5
      WHERE org_id = $1 AND id = (
        SELECT (request_payload->>'transferId')::uuid FROM abdm_transaction
        WHERE org_id=$1 AND request_id=$2 AND flow_kind='PULL_HEALTH_INFO'
      ) AND status='INITIATED'`,
    [input.orgId, input.responseRequestId, input.transactionId,
      input.error || input.sessionStatus === 'FAILED' ? 'FAILED' : 'REQUESTED',
      input.error?.message ?? null],
  );
  if (!result.rowCount) throw new Error('uncorrelated_health_info_response');

}

/**
 * M3 HIU: Receives encrypted FHIR bundle pushed to dataPushUrl.
 * Verifies checksum, decrypts via Fidelius, ingests into Evidence Ledger as 'extracted',
 * detects conflicts, immediately wipes ephemeral private key, and notifies Gateway.
 */
export async function receiveHealthInfoPush(
  q: Querier,
  input: ReceiveHealthInfoPushInput,
): Promise<{ success: boolean; documentsIngested: number }> {
  const transactionId = input.payload.transactionId;

  // Retrieve transfer record
  const trRes = await q.query<{
    id: string;
    patient_id: string;
    consent_artifact_id: string;
    ephemeral_nonce: string;
    ephemeral_private_key_enc: string | null;
    status: string;
    page_count: number;
    received_pages: number;
    ingested_document_ids: string[];
  }>(
    `SELECT id, patient_id, consent_artifact_id, ephemeral_nonce, ephemeral_private_key_enc,
            status, page_count, received_pages, ingested_document_ids
       FROM abdm_hi_transfer
      WHERE org_id = $1 AND abdm_transaction_id = $2`,
    [input.orgId, transactionId],
  );

  const transfer = trRes.rows[0];
  if (!transfer) {
    throw new Error('transfer_not_found: Transaction ID does not match an active pull transfer');
  }

  // Check consent validity
  const artRes = await q.query<{ status: string; data_erase_at: Date }>(
    `SELECT status, data_erase_at FROM abdm_consent_artifact WHERE id = $1`,
    [transfer.consent_artifact_id],
  );
  const art = artRes.rows[0];
  if (!art || art.status !== 'GRANTED' || art.data_erase_at.getTime() <= Date.now()) {
    throw new Error('consent_revoked_or_expired: Ingestion refused under inactive consent');
  }

  if (!transfer.ephemeral_private_key_enc) {
    throw new Error('ephemeral_key_unavailable: Private key was already purged');
  }

  const hiuPrivKey = unprotectTransferKey(transfer.ephemeral_private_key_enc);
  const hiuNonceB64 = transfer.ephemeral_nonce;
  const peerPublicKey = input.payload.keyMaterial.dhPublicKey.keyValue;
  const peerNonce = input.payload.keyMaterial.nonce;

  // Retrieve user to attribute inbound external transfer document
  const uRes = await q.query<{ requested_by: string | null }>(
    `SELECT cr.requested_by
       FROM abdm_consent_artifact ca
       LEFT JOIN abdm_consent_request cr ON cr.id = ca.consent_request_id
      WHERE ca.id = $1`,
    [transfer.consent_artifact_id],
  );
  let uploadedBy = uRes.rows[0]?.requested_by;
  if (!uploadedBy) {
    const fallbackUser = await q.query<{ user_id: string }>(
      `SELECT user_id FROM membership WHERE org_id = $1 LIMIT 1`,
      [input.orgId],
    );
    uploadedBy = fallbackUser.rows[0]?.user_id;
  }
  if (!uploadedBy) {
    throw new Error('no_user_found_for_org: Cannot attribute inbound document');
  }

  const newDocIds: string[] = [];

  try {
    for (const entry of input.payload.entries) {
      // 1. Verify MD5 checksum
      const expectedChecksum = createHash('md5').update(entry.content).digest('hex');
      if (entry.checksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
        throw new Error('checksum_mismatch: Payload integrity verification failed');
      }

      // 2. Decrypt with Fidelius ECDH
      const decryptedJson = decryptPayload(
        entry.content,
        hiuPrivKey,
        hiuNonceB64,
        peerPublicKey,
        peerNonce,
      );

      // 3. Ingest into storage and create document
      const fileBytes = Buffer.from(decryptedJson, 'utf8');
      const filename = `ABDM-inbound-${entry.careContextReference || randomUUID().slice(0, 8)}.json`;

      const { documentId } = await createDocument(q, input.storage, {
        orgId: input.orgId,
        patientId: transfer.patient_id,
        sourceKind: 'fhir_document',
        filename,
        mimeType: 'application/fhir+json',
        content: fileBytes,
        uploadedBy,
        recordOrigin: 'external_hospital',
        issuingFacility: input.gateway?.driver === 'simulated' ? 'Synthetic ABDM Facility' : 'External ABDM Facility',
        isDemoFixture: input.gateway?.driver === 'simulated',
      });

      // 4. Ingest document pages, text spans, and extract facts into Evidence Ledger
      await ingestDocument(
        q,
        {
          storage: input.storage,
          ocr: input.ocr,
          extractor: input.extractor,
        },
        documentId,
      );

      newDocIds.push(documentId);
    }

    const totalReceived = transfer.received_pages + 1;
    const isCompleted = totalReceived >= (input.payload.pageCount || 1);

    // Update transfer status and zero out private key once transfer complete
    await q.query(
      `UPDATE abdm_hi_transfer
          SET received_pages = $3,
              page_count = $4,
              ingested_document_ids = array_cat(ingested_document_ids, $5),
              status = CASE WHEN $6 = true THEN 'TRANSFERRED' ELSE 'ACKNOWLEDGED' END,
              ephemeral_private_key_enc = CASE WHEN $6 = true THEN NULL ELSE ephemeral_private_key_enc END,
              completed_at = CASE WHEN $6 = true THEN now() ELSE completed_at END
        WHERE id = $1 AND org_id = $2`,
      [
        transfer.id,
        input.orgId,
        totalReceived,
        input.payload.pageCount || 1,
        newDocIds,
        isCompleted,
      ],
    );

    // Notify Gateway of receipt
    if (isCompleted && input.gateway) {
      const orgRes = await q.query<{ abdm_hiu_id: string | null }>(
        `SELECT abdm_hiu_id FROM organization WHERE id = $1`,
        [input.orgId],
      );
      const hiuId = orgRes.rows[0]?.abdm_hiu_id || 'ONCOBRIEF_HIU';

      await input.gateway.notifyHiuHealthInfoReceived({
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
        notifier: { type: 'HIU', id: hiuId },
        statusNotification: {
          sessionStatus: 'TRANSFERRED',
          hipId: hiuId,
          statusResponses: input.payload.entries.map((e) => ({
            careContextReference: e.careContextReference,
            hiStatus: 'OK',
            description: 'Delivered and ingested into evidence ledger',
          })),
        },
      });
    }

    await appendAuditEvent(q, {
      orgId: input.orgId,
      actor: { userId: null, role: 'gateway' },
      action: 'abdm.hiu.health_info_received',
      entityKind: 'abdm_hi_transfer',
      entityId: transfer.id,
      outcome: 'success',
      metadata: { transactionId, documentsIngested: newDocIds.length },
    });

    return { success: true, documentsIngested: newDocIds.length };
  } finally {
    wipeBuffer(hiuPrivKey);
  }
}

/**
 * M3 HIU: Purges unverified records and ephemeral key material upon consent revocation or expiry.
 */
export async function purgeConsentData(
  q: Querier,
  input: PurgeConsentDataInput,
): Promise<{ purgedTransfersCount: number; purgedFactsCount: number; restrictedFactsCount: number }> {
  const status = input.status ?? 'REVOKED';
  const artifact = await q.query<{ id: string; consent_request_id: string | null }>(
    `UPDATE abdm_consent_artifact SET status=$3, revoked_at=now()
     WHERE org_id=$1 AND abdm_consent_id=$2 RETURNING id, consent_request_id`,
    [input.orgId, input.consentId, status],
  );
  if (!artifact.rows[0]) throw new Error('consent_artifact_not_found');
  await q.query(`UPDATE abdm_consent_request SET status=$3, updated_at=now() WHERE org_id=$1 AND id=$2`,
    [input.orgId, artifact.rows[0].consent_request_id, status]);

  const transfers = await q.query<{ id: string; ingested_document_ids: string[] }>(
    'SELECT id, ingested_document_ids FROM abdm_hi_transfer WHERE org_id=$1 AND consent_artifact_id=$2',
    [input.orgId, artifact.rows[0].id]);
  const documentIds = [...new Set(transfers.rows.flatMap(t => t.ingested_document_ids ?? []))];
  const facts = await q.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM evidence_fact WHERE org_id=$1 AND document_id=ANY($2::uuid[])',
    [input.orgId, documentIds]);
  // Read object locations before the restrictive consent policies hide source content.
  const objects = await q.query<{ storage_key: string }>(
    `SELECT storage_key FROM document WHERE org_id=$1 AND id=ANY($2::uuid[])
     UNION SELECT image_key AS storage_key FROM document_page
     WHERE org_id=$1 AND document_id=ANY($2::uuid[]) AND image_key IS NOT NULL`,
    [input.orgId, documentIds]);

  // A retry cannot read quarantined page rows. Carry outstanding keys in the append-only audit stream.
  const previousCleanup = await q.query<{ failed_objects: Array<string | { storageKey: string }> | null }>(
    `SELECT metadata_json->'failedObjects' AS failed_objects FROM audit_event
     WHERE org_id=$1 AND entity_id=$2 AND action='abdm.hiu.health_info_purged'
     ORDER BY seq DESC LIMIT 1`, [input.orgId, artifact.rows[0].id]);
  const objectKeys = new Set([
    ...objects.rows.map(o => o.storage_key).filter(Boolean),
    ...(previousCleanup.rows[0]?.failed_objects ?? []).flatMap((item) =>
      typeof item === 'string' ? (item === '<redacted>' ? [] : [item]) : [item.storageKey]),
  ]);

  await q.query(`UPDATE document SET ingest_status='quarantined', ingest_error='consent_revoked_or_expired'
    WHERE org_id=$1 AND id=ANY($2::uuid[])`, [input.orgId, documentIds]);
  await q.query(`UPDATE abdm_hi_transfer SET ephemeral_private_key_enc=NULL, status='PURGED'
    WHERE org_id=$1 AND consent_artifact_id=$2`, [input.orgId, artifact.rows[0].id]);

  let removedObjects = 0;
  const failedObjects: string[] = [];
  if (input.storage) {
    for (const key of objectKeys) {
      try {
        await input.storage.delete(key);
        removedObjects++;
      } catch {
        // Cleanup failure must not restore withdrawn access or cryptographic keys.
        failedObjects.push(key);
      }
    }
  } else {
    failedObjects.push(...objectKeys);
  }
  if (failedObjects.length) {
    await q.query(`UPDATE abdm_hi_transfer SET status='FAILED', error_message='raw_source_cleanup_incomplete'
      WHERE org_id=$1 AND consent_artifact_id=$2`, [input.orgId, artifact.rows[0].id]);
  } else {
    await q.query(`UPDATE abdm_hi_transfer SET error_message=NULL WHERE org_id=$1 AND consent_artifact_id=$2`,
      [input.orgId, artifact.rows[0].id]);
  }
  const restrictedFactsCount = facts.rows[0]?.n ?? 0;
  await appendAuditEvent(q, {
    orgId: input.orgId, actor: { userId: input.userId ?? null, role: input.actorRole ?? 'system' },
    action: 'abdm.hiu.health_info_purged', entityKind: 'abdm_consent_artifact', entityId: artifact.rows[0].id,
    outcome: failedObjects.length ? 'error' : 'success', metadata: { consentId: input.consentId, status, restrictedFactsCount,
      removedObjects,
      // Operational opaque object keys are needed for retry after source RLS hides pages.
      // Named objects survive recursive PHI redaction; primitive array text does not.
      failedObjects: failedObjects.map(storageKey => ({ storageKey })), immutableLedgerRetained: true },
  });
  // No immutable facts, source spans, or audit history are deleted or rewritten.
  return { purgedTransfersCount: failedObjects.length ? 0 : transfers.rows.length, purgedFactsCount: 0, restrictedFactsCount };
}

/**
 * Periodic / daily sweep for expired consent artifacts past dataEraseAt.
 */
export async function sweepExpiredConsents(
  q: Querier,
  input: { orgId?: string; storage?: StoragePort } = {},
): Promise<{ sweptCount: number }> {
  const expiredRes = await q.query<{ org_id: string; abdm_consent_id: string }>(
    `SELECT org_id, abdm_consent_id
       FROM abdm_consent_artifact
      WHERE status = 'GRANTED'
        AND data_erase_at <= now()
        AND ($1::uuid IS NULL OR org_id = $1)`,
    [input.orgId ?? null],
  );

  let sweptCount = 0;
  for (const exp of expiredRes.rows) {
    await purgeConsentData(q, {
      orgId: exp.org_id,
      consentId: exp.abdm_consent_id,
      storage: input.storage,
      status: 'EXPIRED',
    });
    sweptCount++;
  }

  return { sweptCount };
}

/**
 * Lists ABDM consent requests and artifacts for a patient.
 */
export async function listPatientAbdmConsents(
  q: Querier,
  patientId: string,
): Promise<{
  requests: Array<{
    id: string;
    abdmConsentRequestId: string | null;
    status: string;
    hiTypes: string[];
    permissionFrom: string;
    permissionTo: string;
    dataEraseAt: string;
    createdAt: string;
  }>;
  transfers: Array<{ id: string; status: string; errorMessage: string | null; documentCount: number; receivedPages: number; pageCount: number }>;
  artifacts: Array<{
    id: string;
    abdmConsentId: string;
    roleKind: string;
    status: string;
    hiTypes: string[];
    dataEraseAt: string;
    grantedAt: string;
  }>;
}> {
  const reqRes = await q.query<{
    id: string;
    abdm_consent_request_id: string | null;
    status: string;
    hi_types: string[];
    permission_from: Date;
    permission_to: Date;
    data_erase_at: Date;
    created_at: Date;
  }>(
    `SELECT id, abdm_consent_request_id, status, hi_types, permission_from, permission_to, data_erase_at, created_at
       FROM abdm_consent_request
      WHERE patient_id = $1
      ORDER BY created_at DESC LIMIT 5`,
    [patientId],
  );

  const artRes = await q.query<{
    id: string;
    abdm_consent_id: string;
    role_kind: string;
    status: string;
    hi_types: string[];
    data_erase_at: Date;
    granted_at: Date;
  }>(
    `SELECT id, abdm_consent_id, role_kind, status, hi_types, data_erase_at, granted_at
       FROM abdm_consent_artifact
      WHERE patient_id = $1
      ORDER BY granted_at DESC LIMIT 5`,
    [patientId],
  );

  const transfers = await q.query<{ id: string; status: string; error_message: string | null; ingested_document_ids: string[]; received_pages: number; page_count: number }>(
    `SELECT id, status, error_message, ingested_document_ids, received_pages, page_count FROM abdm_hi_transfer
     WHERE patient_id=$1 AND direction='HIU_PULL' ORDER BY created_at DESC LIMIT 10`, [patientId]);
  return {
    transfers: transfers.rows.map(t => ({ id: t.id, status: t.status, errorMessage: t.error_message,
      documentCount: t.ingested_document_ids.length, receivedPages: t.received_pages, pageCount: t.page_count })),
    requests: reqRes.rows.map((r) => ({
      id: r.id,
      abdmConsentRequestId: r.abdm_consent_request_id,
      status: r.status,
      hiTypes: r.hi_types,
      permissionFrom: r.permission_from.toISOString(),
      permissionTo: r.permission_to.toISOString(),
      dataEraseAt: r.data_erase_at.toISOString(),
      createdAt: r.created_at.toISOString(),
    })),
    artifacts: artRes.rows.map((a) => ({
      id: a.id,
      abdmConsentId: a.abdm_consent_id,
      roleKind: a.role_kind,
      status: a.status,
      hiTypes: a.hi_types,
      dataEraseAt: a.data_erase_at.toISOString(),
      grantedAt: a.granted_at.toISOString(),
    })),
  };
}
