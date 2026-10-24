import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closePools } from '../src/client';
import { appClientForOrg, setupFixtures, type Fixtures } from './helpers';
import {
  generateLinkTokenFlow,
  handleOnGenerateLinkToken,
  linkApprovedPacketCareContext,
  handleOnCareContextLinked,
  discoverPatientCareContexts,
  initUserLink,
  confirmUserLink,
  handleHipConsentNotify,
  processHealthInfoRequest,
} from '../src/services/abdm-hip';
import { createPacket, approvePacket } from '../src/services/packets';
import { upsertAbdmPatientLink } from '../src/services/patients';
import { SimulatedAbdmGatewayAdapter, generateEphemeralKeyPair } from '@oncobrief/adapters';

describe('ABDM M2 HIP Service', () => {
  let fx: Fixtures;
  let simulatedGw: SimulatedAbdmGatewayAdapter;

  beforeAll(async () => {
    fx = await setupFixtures();
    simulatedGw = new SimulatedAbdmGatewayAdapter();
  }, 120_000);

  afterAll(async () => {
    await closePools();
  });

  it('generates link token and stores received link token on callback', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    // Set up demographic link
    await upsertAbdmPatientLink(c, {
      orgId: fx.org1,
      patientId,
      abhaAddress: 'testpatient@sbx',
      abhaNumber: '91-1234-5678-9012',
      aadhaarName: 'Test Patient',
      gender: 'M',
      yearOfBirth: 1985,
      mobileLast10: '9876543210',
    });

    const flowRes = await generateLinkTokenFlow(c, {
      orgId: fx.org1,
      patientId,
      gateway: simulatedGw,
    });
    expect(flowRes.requestId).toBeDefined();
    expect(flowRes.status).toBe('accepted');

    // Simulate receiving link token from ABDM Gateway callback
    const sampleToken = 'header.payload.signature-jwt-token';
    await handleOnGenerateLinkToken(c, {
      orgId: fx.org1,
      abhaAddress: 'testpatient@sbx',
      linkToken: sampleToken,
      responseRequestId: flowRes.requestId,
    });

    const check = await c.query<{ link_token_enc: string; link_token_expires_at: Date }>(
      'SELECT link_token_enc, link_token_expires_at FROM abdm_patient_link WHERE org_id = $1 AND patient_id = $2',
      [fx.org1, patientId],
    );
    expect(check.rows[0]?.link_token_enc).toBe(sampleToken);
    expect(check.rows[0]?.link_token_expires_at.getTime()).toBeGreaterThan(Date.now());

    await c.end();
  });

  it('rejects linking unapproved (draft) consultation packet', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    // Create a draft packet
    const draft = await createPacket(c, {
      orgId: fx.org1,
      patientId,
      encounterLabel: 'Initial Oncology Intake',
      userId: fx.clinicians.clinician,
    });

    await expect(
      linkApprovedPacketCareContext(c, {
        orgId: fx.org1,
        patientId,
        packetId: draft.packetId,
        gateway: simulatedGw,
      }),
    ).rejects.toThrow('packet_not_approved');

    await c.end();
  });

  it('successfully links approved frozen packet to ABDM care context', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    // Create and approve packet
    const { packetId } = await createPacket(c, {
      orgId: fx.org1,
      patientId,
      encounterLabel: 'Follow-up Chemo Review',
      userId: fx.clinicians.clinician,
    });

    await approvePacket(c, {
      packetId,
      userId: fx.clinicians.clinician,
      approvalNote: 'Approved for care continuity',
    });

    // Link care context
    const linkRes = await linkApprovedPacketCareContext(c, {
      orgId: fx.org1,
      patientId,
      packetId,
      gateway: simulatedGw,
    });

    expect(linkRes.careContextRef).toBe(`CC-${packetId}`);
    expect(['accepted', 'LINKED']).toContain(linkRes.status);

    // Simulate gateway callback ACK
    await handleOnCareContextLinked(c, {
      orgId: fx.org1,
      careContextRef: linkRes.careContextRef,
      status: 'SUCCESS',
    });

    const ccCheck = await c.query<{ status: string; linked_at: Date | null }>(
      'SELECT status, linked_at FROM abdm_care_context WHERE org_id = $1 AND care_context_reference = $2',
      [fx.org1, linkRes.careContextRef],
    );
    expect(ccCheck.rows[0]?.status).toBe('LINKED');
    expect(ccCheck.rows[0]?.linked_at).toBeDefined();

    await c.end();
  });

  it('discovers patient care contexts and returns unlinked approved packets', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    // Create and approve a second packet so there is an unlinked approved packet
    const { packetId } = await createPacket(c, {
      orgId: fx.org1,
      patientId,
      encounterLabel: 'Radiation Therapy Consult',
      userId: fx.clinicians.clinician,
    });
    await approvePacket(c, {
      packetId,
      userId: fx.clinicians.clinician,
    });

    const inboundReqId = randomUUID();
    const txnId = randomUUID();

    const discRes = await discoverPatientCareContexts(c, {
      orgId: fx.org1,
      inboundRequestId: inboundReqId,
      transactionId: txnId,
      verifiedIdentifiers: [{ type: 'ABHA_ADDRESS', value: 'testpatient@sbx' }],
      gateway: simulatedGw,
    });

    expect(discRes.matched).toBe(true);
    expect(discRes.patientId).toBe(patientId);
    expect(discRes.careContextsCount).toBeGreaterThanOrEqual(1);

    // Discovery with unknown identifier returns matched: false
    const unknownRes = await discoverPatientCareContexts(c, {
      orgId: fx.org1,
      inboundRequestId: randomUUID(),
      transactionId: randomUUID(),
      verifiedIdentifiers: [{ type: 'ABHA_ADDRESS', value: 'nonexistent@sbx' }],
      gateway: simulatedGw,
    });
    expect(unknownRes.matched).toBe(false);

    await c.end();
  });

  it('handles user-initiated link init (OTP) and confirm verification', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    const { packetId } = await createPacket(c, {
      orgId: fx.org1,
      patientId,
      encounterLabel: 'Surgical Consult',
      userId: fx.clinicians.clinician,
    });
    await approvePacket(c, { packetId, userId: fx.clinicians.clinician });

    const ccRef = `CC-${packetId}`;
    const inboundReqId = randomUUID();
    const txnId = randomUUID();

    // 1. Init OTP
    const initRes = await initUserLink(c, {
      orgId: fx.org1,
      inboundRequestId: inboundReqId,
      transactionId: txnId,
      patientReference: patientId,
      careContextReferences: [ccRef],
      gateway: simulatedGw,
    });

    expect(initRes.linkReferenceNumber).toMatch(/^LRN-/);
    expect(initRes.otpForDemo).toHaveLength(6);

    // 2. Confirm with wrong OTP -> fails
    const failConfirm = await confirmUserLink(c, {
      orgId: fx.org1,
      inboundRequestId: randomUUID(),
      transactionId: txnId,
      linkReferenceNumber: initRes.linkReferenceNumber,
      token: '000000',
      gateway: simulatedGw,
    });
    expect(failConfirm.success).toBe(false);

    // 3. Confirm with valid OTP -> succeeds
    const successConfirm = await confirmUserLink(c, {
      orgId: fx.org1,
      inboundRequestId: randomUUID(),
      transactionId: txnId,
      linkReferenceNumber: initRes.linkReferenceNumber,
      token: initRes.otpForDemo,
      gateway: simulatedGw,
    });
    expect(successConfirm.success).toBe(true);

    const ccCheck = await c.query<{ status: string }>(
      'SELECT status FROM abdm_care_context WHERE org_id = $1 AND care_context_reference = $2',
      [fx.org1, ccRef],
    );
    expect(ccCheck.rows[0]?.status).toBe('LINKED');

    await c.end();
  });

  it('handles granted consent and transfers encrypted NRCeS FHIR bundle on data request', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    // Ensure we have an approved and linked packet
    const { packetId } = await createPacket(c, {
      orgId: fx.org1,
      patientId,
      encounterLabel: 'Tumour Board Multidisciplinary Packet',
      userId: fx.clinicians.clinician,
    });
    await approvePacket(c, { packetId, userId: fx.clinicians.clinician });
    const ccRef = `CC-${packetId}`;

    await c.query(
      `INSERT INTO abdm_care_context
         (org_id, patient_id, packet_id, care_context_reference, display_label, abha_address, status, linked_at)
       VALUES ($1, $2, $3, $4, 'Tumour Board Packet', 'testpatient@sbx', 'LINKED', now())
       ON CONFLICT (org_id, care_context_reference) DO UPDATE SET status = 'LINKED'`,
      [fx.org1, patientId, packetId, ccRef],
    );

    // 1. Notify granted consent
    const consentId = `CONSENT-${randomUUID()}`;
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await handleHipConsentNotify(c, {
      orgId: fx.org1,
      inboundRequestId: randomUUID(),
      consentId,
      status: 'GRANTED',
      consentDetail: {
        patient: { id: 'testpatient@sbx' },
        hiTypes: ['OPConsultation'],
        careContexts: [{ careContextReference: ccRef }],
        permission: {
          dateRange: { from: '2025-01-01T00:00:00.000Z', to: futureDate },
          dataEraseAt: futureDate,
        },
      },
      gateway: simulatedGw,
    });

    // 2. Request Health Information with simulated peer key material
    const peerKeyPair = generateEphemeralKeyPair();
    const dataPushUrl = 'https://hiu.example.com/api/v3/hiu/health-information/push';
    const txnId = randomUUID();

    const transferRes = await processHealthInfoRequest(c, {
      orgId: fx.org1,
      inboundRequestId: randomUUID(),
      transactionId: txnId,
      consentId,
      dataPushUrl,
      keyMaterial: peerKeyPair.keyMaterial,
      gateway: simulatedGw,
    });

    expect(transferRes.transferred).toBe(true);
    expect(transferRes.entriesCount).toBeGreaterThanOrEqual(1);

    // Verify transfer logged in abdm_hi_transfer
    const transferRow = await c.query<{ status: string; direction: string }>(
      'SELECT status, direction FROM abdm_hi_transfer WHERE org_id = $1 AND abdm_transaction_id = $2',
      [fx.org1, txnId],
    );
    expect(transferRow.rows[0]?.status).toBe('TRANSFERRED');
    expect(transferRow.rows[0]?.direction).toBe('HIP_PUSH');

    // 3. Requesting under revoked consent throws and records audit rejection
    await handleHipConsentNotify(c, {
      orgId: fx.org1,
      inboundRequestId: randomUUID(),
      consentId,
      status: 'REVOKED',
      gateway: simulatedGw,
    });

    await expect(
      processHealthInfoRequest(c, {
        orgId: fx.org1,
        inboundRequestId: randomUUID(),
        transactionId: randomUUID(),
        consentId,
        dataPushUrl,
        keyMaterial: peerKeyPair.keyMaterial,
        gateway: simulatedGw,
      }),
    ).rejects.toThrow('abdm_consent_invalid_or_expired');

    await c.end();
  });
});
