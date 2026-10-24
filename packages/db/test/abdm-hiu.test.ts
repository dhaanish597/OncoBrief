import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { closePools, getMigratorPool } from '../src/client';
import { appClientForOrg, setupFixtures, type Fixtures } from './helpers';
import {
  initiateHiuConsent,
  handleOnConsentRequestInit,
  handleHiuConsentNotify,
  handleOnFetchConsentArtifact,
  requestHealthInfoPull,
  handleOnHealthInfoRequest,
  receiveHealthInfoPush,
  sweepExpiredConsents,
  purgeConsentData,
} from '../src/services/abdm-hiu';
import {
  SimulatedAbdmGatewayAdapter,
  generateEphemeralKeyPair,
  encryptPayload,
  LocalFsStorageAdapter,
  LocalMultimodalOcrAdapter,
  RuleBasedExtractor,
} from '@oncobrief/adapters';
import { protectTransferKey } from '../src/services/abdm-key';
import { exportToAbdmDocumentBundle } from '@oncobrief/domain';

describe('ABDM M3 HIU Service', () => {
  let fx: Fixtures;
  let simulatedGw: SimulatedAbdmGatewayAdapter;
  let storage: LocalFsStorageAdapter;
  let ocr: LocalMultimodalOcrAdapter;
  let extractor: RuleBasedExtractor;

  beforeAll(async () => {
    fx = await setupFixtures();
    simulatedGw = new SimulatedAbdmGatewayAdapter();
    storage = new LocalFsStorageAdapter('/tmp/oncobrief-test-storage', 'test-secret-at-least-32-chars-long!');
    ocr = new LocalMultimodalOcrAdapter();
    extractor = new RuleBasedExtractor();
  }, 120_000);

  afterAll(async () => {
    await closePools();
  });

  it('rejects consent request with dateRange.to in the future or past dataEraseAt', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    // Future dateRange.to
    await expect(
      initiateHiuConsent(c, {
        orgId: fx.org1,
        patientId,
        userId: fx.clinicians.clinician,
        patientAbhaAddress: 'patient@sbx',
        hiTypes: ['OPConsultation'],
        dateRange: {
          from: '2025-01-01T00:00:00.000Z',
          to: new Date(Date.now() + 86_400_000 * 10).toISOString(),
        },
        dataEraseAt: new Date(Date.now() + 86_400_000 * 30).toISOString(),
        gateway: simulatedGw,
      }),
    ).rejects.toThrow('invalid_date_range');

    // Past dataEraseAt
    await expect(
      initiateHiuConsent(c, {
        orgId: fx.org1,
        patientId,
        userId: fx.clinicians.clinician,
        patientAbhaAddress: 'patient@sbx',
        hiTypes: ['OPConsultation'],
        dateRange: {
          from: '2024-01-01T00:00:00.000Z',
          to: '2024-12-31T00:00:00.000Z',
        },
        dataEraseAt: '2024-01-01T00:00:00.000Z',
        gateway: simulatedGw,
      }),
    ).rejects.toThrow('invalid_data_erase_at');

    await c.end();
  });

  it('initiates HIU consent request and handles on-init ACK', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    const fromDate = '2024-01-01T00:00:00.000Z';
    const toDate = new Date().toISOString();
    const eraseDate = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const initRes = await initiateHiuConsent(c, {
      orgId: fx.org1,
      patientId,
      userId: fx.clinicians.clinician,
      patientAbhaAddress: 'patient@sbx',
      hiTypes: ['OPConsultation', 'DiagnosticReport'],
      dateRange: { from: fromDate, to: toDate },
      dataEraseAt: eraseDate,
      gateway: simulatedGw,
    });

    expect(initRes.consentRequestId).toBeDefined();
    expect(initRes.abdmRequestId).toBeDefined();

    // Inbound on-init callback from gateway
    const gatewayConsentReqId = `CR-${randomUUID()}`;
    await handleOnConsentRequestInit(c, {
      orgId: fx.org1,
      responseRequestId: initRes.abdmRequestId,
      consentRequestId: gatewayConsentReqId,
    });

    const check = await c.query<{ status: string; abdm_consent_request_id: string }>(
      'SELECT status, abdm_consent_request_id FROM abdm_consent_request WHERE id = $1',
      [initRes.consentRequestId],
    );
    expect(check.rows[0]?.status).toBe('REQUESTED');
    expect(check.rows[0]?.abdm_consent_request_id).toBe(gatewayConsentReqId);

    await c.end();
  });

  it('handles GRANTED consent notify, stores artifact, and requests health info pull', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    const fromDate = '2024-01-01T00:00:00.000Z';
    const toDate = new Date().toISOString();
    const eraseDate = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const { consentRequestId: _consentRequestId, abdmRequestId } = await initiateHiuConsent(c, {
      orgId: fx.org1,
      patientId,
      userId: fx.clinicians.clinician,
      patientAbhaAddress: 'patient@sbx',
      hiTypes: ['OPConsultation'],
      dateRange: { from: fromDate, to: toDate },
      dataEraseAt: eraseDate,
      gateway: simulatedGw,
    });

    const gatewayConsentReqId = `CR-${randomUUID()}`;
    await handleOnConsentRequestInit(c, {
      orgId: fx.org1,
      responseRequestId: abdmRequestId,
      consentRequestId: gatewayConsentReqId,
    });

    // 1. Patient grants consent on ABHA app -> Gateway notifies HIU
    const consentArtifactId = `CA-${randomUUID()}`;
    await handleHiuConsentNotify(c, {
      orgId: fx.org1,
      inboundRequestId: randomUUID(),
      status: 'GRANTED',
      consentRequestId: gatewayConsentReqId,
      consentArtefacts: [{ id: consentArtifactId }],
      gateway: simulatedGw,
    });

    // 2. Gateway delivers on-fetch callback with full consent artifact details
    await handleOnFetchConsentArtifact(c, {
      orgId: fx.org1,
      consent: {
        consentDetail: {
          consentId: consentArtifactId,
          hiTypes: ['OPConsultation'],
          careContexts: [{ careContextReference: 'CC-EXT-999' }],
          permission: {
            dateRange: { from: fromDate, to: toDate },
            dataEraseAt: eraseDate,
          },
        },
      },
    });

    const artCheck = await c.query<{ status: string; care_contexts_json: unknown }>(
      'SELECT status, care_contexts_json FROM abdm_consent_artifact WHERE abdm_consent_id = $1',
      [consentArtifactId],
    );
    expect(artCheck.rows[0]?.status).toBe('GRANTED');

    // 3. Request health information pull using granted consent artifact
    const dataPushUrl = 'https://oncobrief.example.com/api/v3/hiu/health-information/push';
    const pullRes = await requestHealthInfoPull(c, {
      orgId: fx.org1,
      consentId: consentArtifactId,
      dataPushUrl,
      gateway: simulatedGw,
    });

    expect(pullRes.transferId).toBeDefined();
    expect(pullRes.abdmRequestId).toBeDefined();

    const trCheck = await c.query<{ status: string; ephemeral_private_key_enc: string | null }>(
      'SELECT status, ephemeral_private_key_enc FROM abdm_hi_transfer WHERE id = $1',
      [pullRes.transferId],
    );
    expect(trCheck.rows[0]?.status).toBe('INITIATED');
    expect(trCheck.rows[0]?.ephemeral_private_key_enc).toBeDefined();

    await c.end();
  });

  it('correlates concurrent pull ACKs to exactly one transfer and protects keys at rest', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const consentId = `CA-CORRELATE-${randomUUID()}`;
    await c.query(`INSERT INTO abdm_consent_artifact
      (org_id, patient_id, abdm_consent_id, role_kind, status, hi_types, permission_from, permission_to, data_erase_at)
      VALUES ($1,$2,$3,'HIU','GRANTED','{DiagnosticReport}',now()-interval '1 day',now(),now()+interval '1 day')`,
      [fx.org1, fx.patients.demo1, consentId]);
    const first = await requestHealthInfoPull(c, { orgId: fx.org1, consentId, dataPushUrl: 'http://localhost/push', gateway: simulatedGw });
    const second = await requestHealthInfoPull(c, { orgId: fx.org1, consentId, dataPushUrl: 'http://localhost/push', gateway: simulatedGw });
    await handleOnHealthInfoRequest(c, { orgId: fx.org1, responseRequestId: first.abdmRequestId, transactionId: `tx-${randomUUID()}`, sessionStatus: 'ACKNOWLEDGED' });
    const rows = (await c.query('SELECT id,status,ephemeral_private_key_enc FROM abdm_hi_transfer WHERE id=ANY($1::uuid[])', [[first.transferId, second.transferId]])).rows;
    expect(rows.find(r => r.id === first.transferId).status).toBe('REQUESTED');
    expect(rows.find(r => r.id === second.transferId).status).toBe('INITIATED');
    for (const row of rows) expect(row.ephemeral_private_key_enc).toMatch(/^v1\./);
    await c.end();
  });

  it('receives encrypted health information push, decrypts via Fidelius, ingests into Evidence Ledger as extracted, and wipes ephemeral key', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    const fromDate = '2024-01-01T00:00:00.000Z';
    const toDate = new Date().toISOString();
    const eraseDate = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const consentArtifactId = `CA-${randomUUID()}`;

    // Directly insert granted consent artifact
    const artRes = await c.query<{ id: string }>(
      `INSERT INTO abdm_consent_artifact
         (org_id, patient_id, abdm_consent_id, role_kind, status, hi_types,
          permission_from, permission_to, data_erase_at)
       VALUES ($1, $2, $3, 'HIU', 'GRANTED', '{OPConsultation}', $4, $5, $6)
       RETURNING id`,
      [fx.org1, patientId, consentArtifactId, fromDate, toDate, eraseDate],
    );
    const artifactDbId = artRes.rows[0]!.id;

    // Generate HIU ephemeral keypair
    const hiuKeyPair = generateEphemeralKeyPair();
    const txnId = `TXN-${randomUUID()}`;

    const trRes = await c.query<{ id: string }>(
      `INSERT INTO abdm_hi_transfer
         (org_id, patient_id, consent_artifact_id, direction, abdm_transaction_id, data_push_url,
          ephemeral_public_key, ephemeral_nonce, ephemeral_private_key_enc, status)
       VALUES ($1, $2, $3, 'HIU_PULL', $4, 'https://example.com/push', $5, $6, $7, 'REQUESTED')
       RETURNING id`,
      [
        fx.org1,
        patientId,
        artifactDbId,
        txnId,
        hiuKeyPair.publicKeyBase64,
        hiuKeyPair.nonceBase64,
        protectTransferKey(hiuKeyPair.privateKey),
      ],
    );
    const transferId = trRes.rows[0]!.id;

    // Build a mock external NRCeS FHIR DocumentBundle with clinical oncology observations
    const extBundle = exportToAbdmDocumentBundle(
      [
        {
          id: randomUUID(),
          patientId,
          documentId: randomUUID(),
          factType: 'diagnosis_text.as_written',
          value: { kind: 'text', text: 'Invasive Ductal Carcinoma of Breast' },
          verbatimQuote: 'Biopsy confirmed invasive ductal carcinoma, Grade 2',
          state: 'verified',
        },
        {
          id: randomUUID(),
          patientId,
          documentId: randomUUID(),
          factType: 'lab_result.as_written',
          value: { kind: 'lab', name: 'ER', valueText: 'Positive', unitText: '%' },
          verbatimQuote: 'ER: Positive 80%',
          state: 'verified',
        },
      ],
      {
        patientId,
        patientName: 'Jane Doe',
        profileType: 'OPConsultRecord',
      },
    );
    const plaintextFhir = JSON.stringify(extBundle);

    // Encrypt using peer (HIP) keypair
    const hipKeyPair = generateEphemeralKeyPair();
    const encrypted = encryptPayload(
      plaintextFhir,
      hipKeyPair.privateKey,
      hipKeyPair.nonceBase64,
      hiuKeyPair.publicKeyBase64,
      hiuKeyPair.nonceBase64,
    );

    // Corruption must fail before creating sources or evidence, even with a recomputed checksum.
    const corruptBytes = Buffer.from(encrypted.content, 'base64');
    corruptBytes[corruptBytes.length - 1]! ^= 1;
    const corruptContent = corruptBytes.toString('base64');
    const beforeDocs = (await c.query('SELECT count(*)::int AS n FROM document WHERE patient_id=$1', [patientId])).rows[0].n;
    await expect(receiveHealthInfoPush(c, {
      orgId: fx.org1, payload: { pageNumber: 0, pageCount: 1, transactionId: txnId,
        entries: [{ content: corruptContent, media: 'application/fhir+json',
          checksum: createHash('md5').update(corruptContent).digest('hex'), careContextReference: 'CC-EXT-999' }],
        keyMaterial: hipKeyPair.keyMaterial }, storage, ocr, extractor, gateway: simulatedGw,
    })).rejects.toThrow();
    expect((await c.query('SELECT count(*)::int AS n FROM document WHERE patient_id=$1', [patientId])).rows[0].n).toBe(beforeDocs);

    // Call receiveHealthInfoPush
    const pushResult = await receiveHealthInfoPush(c, {
      orgId: fx.org1,
      payload: {
        pageNumber: 0,
        pageCount: 1,
        transactionId: txnId,
        entries: [
          {
            content: encrypted.content,
            media: 'application/fhir+json',
            checksum: encrypted.checksum,
            careContextReference: 'CC-EXT-999',
          },
        ],
        keyMaterial: hipKeyPair.keyMaterial,
      },
      storage,
      ocr,
      extractor,
      gateway: simulatedGw,
    });

    expect(pushResult.success).toBe(true);
    expect(pushResult.documentsIngested).toBe(1);

    // Verify transfer record status and that ephemeral private key was WIPED
    const transferPostCheck = await c.query<{
      status: string;
      ephemeral_private_key_enc: string | null;
      ingested_document_ids: string[];
    }>(
      'SELECT status, ephemeral_private_key_enc, ingested_document_ids FROM abdm_hi_transfer WHERE id = $1',
      [transferId],
    );
    expect(transferPostCheck.rows[0]?.status).toBe('TRANSFERRED');
    expect(transferPostCheck.rows[0]?.ephemeral_private_key_enc).toBeNull(); // Key wiped!
    const docId = transferPostCheck.rows[0]?.ingested_document_ids[0];
    expect(docId).toBeDefined();

    // Verify evidence facts were ingested (extracted or flagged conflicting, never auto-verified!)
    const factsCheck = await c.query<{ state: string; fact_type: string }>(
      `SELECT es.state, ef.fact_type
         FROM evidence_fact ef
         JOIN evidence_state es ON es.evidence_fact_id = ef.id
        WHERE ef.org_id = $1 AND ef.document_id = $2`,
      [fx.org1, docId],
    );
    expect(factsCheck.rows.length).toBeGreaterThanOrEqual(1);
    for (const f of factsCheck.rows) {
      expect(['extracted', 'conflicting']).toContain(f.state);
      expect(f.state).not.toBe('verified'); // Strict invariant: never auto-verified
    }

    // Regression: revocation after a real import must preserve immutable ledger rows.
    const stored = (await c.query('SELECT storage_key FROM document WHERE id=$1', [docId])).rows[0];
    await expect(storage.get(stored.storage_key)).resolves.toBeInstanceOf(Buffer);
    const imageKey = `org/${fx.org1}/synthetic-${docId}-page.png`;
    await storage.put(imageKey, Buffer.from('synthetic page render'), 'image/png');
    await c.query('UPDATE document_page SET image_key=$2 WHERE document_id=$1', [docId, imageKey]);
    // Object-storage failure must not roll back withdrawal or restore readable facts.
    await c.query('BEGIN');
    const incomplete = await purgeConsentData(c, { orgId: fx.org1, consentId: consentArtifactId, storage: {
      put: storage.put.bind(storage), get: storage.get.bind(storage), presignGet: storage.presignGet.bind(storage),
      delete: async () => { throw new Error('synthetic_storage_unavailable'); },
    } });
    await c.query('COMMIT');
    expect(incomplete.purgedTransfersCount).toBe(0);
    expect((await c.query('SELECT status FROM abdm_consent_artifact WHERE id=$1', [artifactDbId])).rows[0].status).toBe('REVOKED');
    expect((await c.query('SELECT status, ephemeral_private_key_enc FROM abdm_hi_transfer WHERE id=$1', [transferId])).rows[0]).toMatchObject({ status: 'FAILED', ephemeral_private_key_enc: null });
    expect((await c.query('SELECT count(*)::int AS n FROM evidence_fact WHERE document_id=$1', [docId])).rows[0].n).toBe(0);
    await expect(storage.get(stored.storage_key)).resolves.toBeInstanceOf(Buffer);
    const revocation = await purgeConsentData(c, { orgId: fx.org1, consentId: consentArtifactId, storage });
    expect(revocation.purgedTransfersCount).toBe(1);
    expect((await c.query('SELECT status FROM abdm_consent_artifact WHERE id=$1', [artifactDbId])).rows[0].status).toBe('REVOKED');
    expect((await c.query('SELECT count(*)::int AS n FROM evidence_fact WHERE document_id=$1', [docId])).rows[0].n).toBe(0);
    expect((await getMigratorPool().query('SELECT count(*)::int AS n FROM evidence_fact WHERE document_id=$1', [docId])).rows[0].n).toBe(factsCheck.rows.length);
    for (const table of ['text_span', 'document_page', 'extraction_candidate', 'timeline_event']) {
      expect((await c.query(`SELECT count(*)::int AS n FROM ${table} WHERE document_id=$1`, [docId])).rows[0].n).toBe(0);
    }
    await expect(storage.get(stored.storage_key)).rejects.toThrow();
    await expect(storage.get(imageKey)).rejects.toThrow();
    await c.end();
  });

  it('immediately purges unverified documents and ephemeral keys on consent revocation or expiry', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const patientId = fx.patients.demo1;

    const consentArtifactId = `CA-REVOKE-${randomUUID()}`;
    const artRes = await c.query<{ id: string }>(
      `INSERT INTO abdm_consent_artifact
         (org_id, patient_id, abdm_consent_id, role_kind, status, hi_types,
          permission_from, permission_to, data_erase_at)
       VALUES ($1, $2, $3, 'HIU', 'GRANTED', '{OPConsultation}', now() - interval '10 days', now() - interval '1 day', now() - interval '1 hour')
       RETURNING id`,
      [fx.org1, patientId, consentArtifactId],
    );
    const artifactDbId = artRes.rows[0]!.id;

    // Insert dummy transfer with private key
    const trRes = await c.query<{ id: string }>(
      `INSERT INTO abdm_hi_transfer
         (org_id, patient_id, consent_artifact_id, direction, abdm_transaction_id, data_push_url,
          ephemeral_public_key, ephemeral_nonce, ephemeral_private_key_enc, status)
       VALUES ($1, $2, $3, 'HIU_PULL', $4, 'https://example.com/push', 'pub', 'nonce', 'privkey', 'REQUESTED')
       RETURNING id`,
      [fx.org1, patientId, artifactDbId, `TXN-REV-${randomUUID()}`],
    );
    const transferId = trRes.rows[0]!.id;

    // Run sweepExpiredConsents
    const sweepRes = await sweepExpiredConsents(c, { orgId: fx.org1, storage });
    expect(sweepRes.sweptCount).toBeGreaterThanOrEqual(1);

    // Expiry is recorded as EXPIRED, distinct from manual revocation.
    const artPost = await c.query<{ status: string; revoked_at: Date | null }>(
      'SELECT status, revoked_at FROM abdm_consent_artifact WHERE id = $1',
      [artifactDbId],
    );
    expect(artPost.rows[0]?.status).toBe('EXPIRED');
    expect(artPost.rows[0]?.revoked_at).toBeDefined();

    // Verify transfer is PURGED and private key is wiped
    const trPost = await c.query<{ status: string; ephemeral_private_key_enc: string | null }>(
      'SELECT status, ephemeral_private_key_enc FROM abdm_hi_transfer WHERE id = $1',
      [transferId],
    );
    expect(trPost.rows[0]?.status).toBe('PURGED');
    expect(trPost.rows[0]?.ephemeral_private_key_enc).toBeNull();

    await c.end();
  });
});
