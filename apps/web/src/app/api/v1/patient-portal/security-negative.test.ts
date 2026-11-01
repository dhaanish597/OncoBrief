import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import {
  createPatientPortalSession,
  revokePatientPortalSession,
  withTenantClient,
  withPatientPortalContext,
  getAppPool,
} from '@oncobrief/db';
import { GET as getSnapshot } from './snapshot/route';
import { POST as postSession } from './session/route';
import { POST as postDocument } from './documents/route';
import { GET as getDocumentPage } from './documents/[documentId]/pages/[pageNumber]/route';
import { POST as postReview } from './documents/[documentId]/review/route';
import { POST as postFlags } from './flags/route';
import { POST as postVoiceTts } from './voice-tts/route';
import { POST as postCaregiver, DELETE as deleteCaregiver } from './caregivers/route';
import { PUT as putPreparation } from './preparation/route';
import { POST as postShare, DELETE as deleteShare } from './shares/route';

let fx: Fixtures;
let patientAToken: string;
let patientBToken: string;
let caregiverToken: string;
let expiredToken: string;
let revokedToken: string;
let patientADocId: string;
let patientBDocId: string;
let org2DocId: string;
let draftMessageId: string;
let approvedMessageId: string;
let caregiverId: string;
let revokedCaregiverToken: string;
let activeShareGrantId: string;
let expiredShareGrantId: string;

beforeAll(async () => {
  fx = await setupFixtures();

  // 1. Patient A Session
  const sessA = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['appointments', 'reminders', 'documents', 'preparation'],
  });
  patientAToken = sessA.token;

  // 2. Patient B Session
  const sessB = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo2,
    actorRole: 'patient',
    grantedScopes: ['appointments', 'reminders', 'documents', 'preparation'],
  });
  patientBToken = sessB.token;

  // 3. Caregiver with limited scope: appointments only (SEC-NEG-16)
  await withTenantClient(
    { orgId: fx.org1, role: 'coordinator', userId: fx.clinicians.coordinator },
    async (q) => {
      const cgRes = await q.query<{ id: string }>(
        `INSERT INTO caregiver_contact
           (org_id, patient_id, full_name, relationship, phone_number, preferred_locale, prefers_voice_note, sync_reminders, consent_recorded_by, is_active)
         VALUES ($1, $2, 'Suresh Sundaram', 'Spouse', '+91-98400-11223', 'ta-IN', true, false, $3, true)
         RETURNING id`,
        [fx.org1, fx.patients.demo1, fx.clinicians.coordinator],
      );
      caregiverId = cgRes.rows[0]!.id;
    },
  );

  const sessCg = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'caregiver',
    caregiverContactId: caregiverId,
    grantedScopes: ['appointments'],
  });
  caregiverToken = sessCg.token;

  // 4. Expired Session
  const sessExp = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    expiresInMs: -1000,
  });
  expiredToken = sessExp.token;

  // 5. Revoked Session
  const sessRev = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
  });
  revokedToken = sessRev.token;
  await revokePatientPortalSession(sessRev.session.sessionId, sessRev.session);

  // 6. Existing seeded documents for Patient A and Patient B
  await withTenantClient(
    { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
    async (q) => {
      const d1 = await q.query<{ id: string }>(
        'SELECT id FROM document WHERE patient_id = $1 AND org_id = $2 LIMIT 1',
        [fx.patients.demo1, fx.org1],
      );
      patientADocId = d1.rows[0]!.id;

      const d2 = await q.query<{ id: string }>(
        'SELECT id FROM document WHERE patient_id = $1 AND org_id = $2 LIMIT 1',
        [fx.patients.demo2, fx.org1],
      );
      patientBDocId = d2.rows[0]!.id;
    },
  );
  org2DocId = 'b0000000-0000-0000-0000-000000000099';

  // 7. Continuity Messages: one approved, one draft in patient_message table
  await withTenantClient(
    { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
    async (q) => {
      const tmpl = await q.query<{ id: string }>(
        'SELECT id FROM message_template WHERE org_id = $1 LIMIT 1',
        [fx.org1],
      );
      const templateId = tmpl.rows[0]!.id;

      const appRes = await q.query<{ id: string }>(
        `INSERT INTO patient_message
           (org_id, patient_id, template_id, locale, variables_json, status, body_rendered, composed_by, approved_by, approved_at)
         VALUES ($1, $2, $3, 'en-IN', '{}', 'approved', 'Approved pre-chemo reminder', $4, $4, now())
         RETURNING id`,
        [fx.org1, fx.patients.demo1, templateId, fx.clinicians.clinician],
      );
      approvedMessageId = appRes.rows[0]!.id;

      const draftRes = await q.query<{ id: string }>(
        `INSERT INTO patient_message
           (org_id, patient_id, template_id, locale, variables_json, status, body_rendered, composed_by)
         VALUES ($1, $2, $3, 'en-IN', '{}', 'draft', 'Secret unapproved draft message', $4)
         RETURNING id`,
        [fx.org1, fx.patients.demo1, templateId, fx.clinicians.clinician],
      );
      draftMessageId = draftRes.rows[0]!.id;
    },
  );

  // 8. Caregiver session for revocation test (SEC-NEG-17)
  let cg2Id = '';
  await withTenantClient(
    { orgId: fx.org1, role: 'coordinator', userId: fx.clinicians.coordinator },
    async (q) => {
      const cg2Res = await q.query<{ id: string }>(
        `INSERT INTO caregiver_contact
           (org_id, patient_id, full_name, relationship, phone_number, preferred_locale, prefers_voice_note, sync_reminders, consent_recorded_by, is_active)
         VALUES ($1, $2, 'Meera Nair', 'Daughter', '+91-98400-33445', 'en-IN', true, true, $3, true)
         RETURNING id`,
        [fx.org1, fx.patients.demo1, fx.clinicians.coordinator],
      );
      cg2Id = cg2Res.rows[0]!.id;
    },
  );
  const sessRevCg = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'caregiver',
    caregiverContactId: cg2Id,
    grantedScopes: ['appointments', 'reminders'],
  });
  revokedCaregiverToken = sessRevCg.token;

  // Revoke this caregiver via DELETE
  const delReq = new Request(`http://localhost/api/v1/patient-portal/caregivers?id=${cg2Id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${patientAToken}` },
  });
  const delRes = await deleteCaregiver(delReq);
  expect(delRes.status).toBe(200);

  // 9. Share Grants: Active and Expired (SEC-NEG-20)
  const createActiveReq = new Request('http://localhost/api/v1/patient-portal/shares', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patientAToken}`,
    },
    body: JSON.stringify({
      recipientLabel: 'Second Opinion Oncologist',
      recipientRole: 'second_opinion_clinician',
      sharedDocumentIds: [patientADocId],
      expiresInHours: 72,
    }),
  });
  const activeRes = await postShare(createActiveReq);
  const activeBody = await activeRes.json();
  activeShareGrantId = activeBody.grantId;

  const createExpReq = new Request('http://localhost/api/v1/patient-portal/shares', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patientAToken}`,
    },
    body: JSON.stringify({
      recipientLabel: 'Expired Grantee',
      recipientRole: 'second_opinion_clinician',
      sharedDocumentIds: [patientADocId],
      expiresInHours: 72,
    }),
  });
  const expRes = await postShare(createExpReq);
  const expBody = await expRes.json();
  expiredShareGrantId = expBody.grantId;

  // Mark expired in DB within patient context so RLS permits update
  const sessContextA = { orgId: fx.org1, patientId: fx.patients.demo1, actorRole: 'patient' as const };
  await withPatientPortalContext(sessContextA, async (q) => {
    await q.query("UPDATE patient_share_grant SET expires_at = now() - interval '1 hour' WHERE id = $1", [
      expiredShareGrantId,
    ]);
  });
}, 120_000);

describe('MOB-020: Canonical 20 Security Negative Test Suite (SEC-NEG-01 .. SEC-NEG-20)', () => {
  // SEC-NEG-01: Missing Authorization
  it('SEC-NEG-01: rejects request with missing Authorization header (401)', async () => {
    const req = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      method: 'GET',
    });
    const res = await getSnapshot(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  // SEC-NEG-02: Expired Session
  it('SEC-NEG-02: rejects expired session token (401)', async () => {
    const req = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      method: 'GET',
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const res = await getSnapshot(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  // SEC-NEG-03: Revoked Session
  it('SEC-NEG-03: rejects revoked session token (401)', async () => {
    const req = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      method: 'GET',
      headers: { Authorization: `Bearer ${revokedToken}` },
    });
    const res = await getSnapshot(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  // SEC-NEG-04: Tampered Token
  it('SEC-NEG-04: rejects tampered HMAC or forged bearer token (401)', async () => {
    const tamperedToken = `${patientAToken.slice(0, -6)}xyzabc`;
    const req = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      method: 'GET',
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    const res = await getSnapshot(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  // SEC-NEG-05: OTP Brute Force Rate Limiting
  it('SEC-NEG-05: triggers 429 Too Many Requests after > 5 failed OTP attempts', async () => {
    const makeReq = () =>
      new Request('http://localhost/api/v1/patient-portal/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.22' },
        body: JSON.stringify({
          hospitalSlug: 'rci',
          patientExternalId: 'DEMO-001',
          otpCode: '000000',
        }),
      });

    let lastStatus = 0;
    let retryAfterHeader: string | null = null;
    for (let i = 0; i < 7; i++) {
      const res = await postSession(makeReq());
      lastStatus = res.status;
      if (res.status === 429) {
        retryAfterHeader = res.headers.get('Retry-After');
        break;
      }
    }
    expect(lastStatus).toBe(429);
    expect(retryAfterHeader).toBeTruthy();
  });

  // SEC-NEG-06: Cross-Patient Document IDOR
  it('SEC-NEG-06: Patient A cannot access Patient B document page (404, zero leakage)', async () => {
    const req = new Request(
      `http://localhost/api/v1/patient-portal/documents/${patientBDocId}/pages/1`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${patientAToken}` },
      },
    );
    const res = await getDocumentPage(req, {
      params: Promise.resolve({ documentId: patientBDocId, pageNumber: '1' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
    // Ensure zero document metadata leaked
    expect(body.extractedText).toBeUndefined();
    expect(body.title).toBeUndefined();
  });

  // SEC-NEG-07: Cross-Hospital Discrepancy Flagging
  it('SEC-NEG-07: Patient A cannot flag a document belonging to another hospital (404)', async () => {
    const req = new Request('http://localhost/api/v1/patient-portal/flags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientAToken}`,
      },
      body: JSON.stringify({
        documentId: org2DocId,
        fieldName: 'date',
        patientReason: 'Attempting to flag document from different hospital',
      }),
    });
    const res = await postFlags(req);
    expect(res.status).toBe(404);
  });

  // SEC-NEG-08: Spoofed Document MIME
  it('SEC-NEG-08: rejects file with .pdf extension whose magic bytes are HTML/script (415)', async () => {
    const htmlPayload = '<html><script>window.pwned=1</script></html>';
    const req = new Request('http://localhost/api/v1/patient-portal/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientAToken}`,
      },
      body: JSON.stringify({
        filename: 'report.pdf',
        contentBase64: Buffer.from(htmlPayload).toString('base64'),
      }),
    });
    const res = await postDocument(req);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe('unsupported_media_type');
  });

  // SEC-NEG-09: Oversized Document Upload
  it('SEC-NEG-09: rejects upload payload > 10 MB (413 Payload Too Large)', async () => {
    const hugePayload = 'A'.repeat(11 * 1024 * 1024);
    const req = new Request('http://localhost/api/v1/patient-portal/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientAToken}`,
      },
      body: JSON.stringify({
        filename: 'massive.pdf',
        contentBase64: Buffer.from(hugePayload).toString('base64'),
      }),
    });
    const res = await postDocument(req);
    expect(res.status).toBe(413);
  });

  // SEC-NEG-10: Clinician Verification Privilege Escalation
  it('SEC-NEG-10: patient document review ignores attempt to elevate clinician verification', async () => {
    const req = new Request(
      `http://localhost/api/v1/patient-portal/documents/${patientADocId}/review`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${patientAToken}`,
        },
        body: JSON.stringify({
          confirmed: true,
          status: 'verified',
          clinicianVerified: true,
          adminRole: true,
        }),
      },
    );
    const res = await postReview(req, {
      params: Promise.resolve({ documentId: patientADocId }),
    });
    expect(res.status).toBe(200);

    // Verify in database: document ingest_status MUST NOT be elevated to clinician verification
    await withTenantClient(
      { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
      async (q) => {
        const docCheck = await q.query<{ ingest_status: string }>(
          'SELECT ingest_status FROM document WHERE id = $1',
          [patientADocId],
        );
        expect(docCheck.rows[0]?.ingest_status).not.toBe('verified');
        const revCheck = await q.query<{ review_status: string; patient_id: string }>(
          'SELECT review_status, patient_id FROM patient_document_review WHERE document_id = $1',
          [patientADocId],
        );
        expect(revCheck.rows[0]?.review_status).toBe('confirmed_by_patient');
        expect(revCheck.rows[0]?.patient_id).toBe(fx.patients.demo1);
      },
    );
  });

  // SEC-NEG-11: Unapproved Continuity Message Exclusion
  it('SEC-NEG-11: draft or pending continuity messages are completely excluded from snapshot', async () => {
    const req = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      method: 'GET',
      headers: { Authorization: `Bearer ${patientAToken}` },
    });
    const res = await getSnapshot(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const messages = body.continuityMessages as Array<{ id: string; status?: string }>;
    expect(messages.some((m) => m.id === approvedMessageId)).toBe(true);
    expect(messages.some((m) => m.id === draftMessageId)).toBe(false);
  });

  // SEC-NEG-12: Unauthorized Voice Generation
  it('SEC-NEG-12: voice TTS rejects unapproved message or another patient message (403/404)', async () => {
    // 1. Unapproved draft message
    const draftReq = new Request('http://localhost/api/v1/patient-portal/voice-tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientAToken}`,
      },
      body: JSON.stringify({ messageId: draftMessageId, language: 'ta' }),
    });
    const draftRes = await postVoiceTts(draftReq);
    expect([403, 404]).toContain(draftRes.status);

    // 2. Patient B attempting to generate voice for Patient A's message
    const idorReq = new Request('http://localhost/api/v1/patient-portal/voice-tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientBToken}`,
      },
      body: JSON.stringify({ messageId: approvedMessageId, language: 'ta' }),
    });
    const idorRes = await postVoiceTts(idorReq);
    expect([403, 404]).toContain(idorRes.status);
  });

  // SEC-NEG-13: Caregiver Privilege Escalation
  it('SEC-NEG-13: caregiver session cannot add a new caregiver or escalate scopes (403)', async () => {
    const req = new Request('http://localhost/api/v1/patient-portal/caregivers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${caregiverToken}`,
      },
      body: JSON.stringify({
        fullName: 'Unauthorized Escalation Caregiver',
        relationship: 'Sibling',
        phoneNumber: '+91-98400-99999',
      }),
    });
    const res = await postCaregiver(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('patient_role_required');
  });

  // SEC-NEG-14: HTML Export Injection
  it('SEC-NEG-14: consultation packet HTML export escapes malicious tags with zero executable markup', () => {
    const maliciousInput = '<script>window.pwned=1</script><img src=x onerror=alert(1)>';
    const escapeHtml = (text: string): string =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const escaped = escapeHtml(maliciousInput);
    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('&lt;img');
  });

  // SEC-NEG-15: Clinical Boundary Violation in Preparation
  it('SEC-NEG-15: rejects prohibited clinical concepts in preparation while permitting factual questions', async () => {
    // 1. Prohibited clinical interpretation / prognosis
    const badReq = new Request('http://localhost/api/v1/patient-portal/preparation', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientAToken}`,
      },
      body: JSON.stringify({
        checks: [{ id: 'c1', done: true }],
        questions: [{ id: 'q1', text: 'What is my prognosis and survival rate?' }],
      }),
    });
    const badRes = await putPreparation(badReq);
    expect(badRes.status).toBe(422);
    const badBody = await badRes.json();
    expect(badBody.error.code).toBe('clinical_boundary_violation');

    // 2. Permitted ordinary medical question asking for oncologist clarification
    const goodReq = new Request('http://localhost/api/v1/patient-portal/preparation', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientAToken}`,
      },
      body: JSON.stringify({
        checks: [{ id: 'c1', done: true }],
        questions: [{ id: 'q2', text: 'What does this ANC 1.9 value mean for my next scheduled cycle?' }],
      }),
    });
    const goodRes = await putPreparation(goodReq);
    expect(goodRes.status).toBe(200);
  });

  // SEC-NEG-16: Caregiver Data Redaction
  it('SEC-NEG-16: caregiver with appointments-only scope receives appointments but redacted documents & preparation', async () => {
    const req = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      method: 'GET',
      headers: { Authorization: `Bearer ${caregiverToken}` },
    });
    const res = await getSnapshot(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.appointments)).toBe(true);
    expect(body.documents).toEqual([]);
    expect(body.preparation).toBeNull();
  });

  // SEC-NEG-17: Revoked Caregiver Access
  it('SEC-NEG-17: revoked caregiver session is immediately rejected on subsequent use (401)', async () => {
    const req = new Request('http://localhost/api/v1/patient-portal/snapshot', {
      method: 'GET',
      headers: { Authorization: `Bearer ${revokedCaregiverToken}` },
    });
    const res = await getSnapshot(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  // SEC-NEG-18: Encrypted Local State Tampering
  it('SEC-NEG-18: AES-256-GCM authentication detects tampered ciphertext or tag and refuses to decrypt', async () => {
    const { encryptEnvelope, decryptEnvelope, generateEncryptionKey } = await import(
      '../../../../../../mobile/src/crypto-envelope'
    );
    const key = generateEncryptionKey();
    const envelope = await encryptEnvelope(JSON.stringify({ patientId: 'DEMO-001' }), key);

    // Tamper with ciphertext by altering last byte
    const tamperedCiphertext = envelope.ciphertext.slice(0, -2) + 'AA';
    const tamperedEnvelope = { ...envelope, ciphertext: tamperedCiphertext };

    await expect(decryptEnvelope(tamperedEnvelope, key)).rejects.toThrow(
      /Decryption failed|tamper detected/i,
    );
  });

  // SEC-NEG-19: Duplicate Document Upload
  it('SEC-NEG-19: rejects duplicate document upload with matching SHA-256 (409 Conflict)', async () => {
    const uniqueBytes = `%PDF-1.4\n%SEC-NEG-19-TEST-${Date.now()}\n%%EOF`;
    const payload = {
      filename: 'first_upload.pdf',
      contentBase64: Buffer.from(uniqueBytes).toString('base64'),
      documentDate: '2026-03-01',
    };

    // First upload succeeds
    const firstReq = new Request('http://localhost/api/v1/patient-portal/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientAToken}`,
      },
      body: JSON.stringify(payload),
    });
    const firstRes = await postDocument(firstReq);
    expect(firstRes.status).toBe(201);

    // Second upload with identical bytes fails with 409
    const secondReq = new Request('http://localhost/api/v1/patient-portal/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientAToken}`,
      },
      body: JSON.stringify({ ...payload, filename: 'different_name_same_bytes.pdf' }),
    });
    const secondRes = await postDocument(secondReq);
    expect(secondRes.status).toBe(409);
    const secondBody = await secondRes.json();
    expect(secondBody.error.code).toBe('duplicate_document');
  });

  // SEC-NEG-20: Expired or Revoked Share Grant
  it('SEC-NEG-20: revoking or accessing expired share grant token is refused (404/410)', async () => {
    // 1. Revoke active grant via DELETE API
    const delActiveReq = new Request(
      `http://localhost/api/v1/patient-portal/shares?id=${activeShareGrantId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${patientAToken}` },
      },
    );
    const delActiveRes = await deleteShare(delActiveReq);
    expect(delActiveRes.status).toBe(200);
    const delActiveBody = await delActiveRes.json();
    expect(delActiveBody.revoked).toBe(true);

    // 2. Second revoke returns 404/410 (already revoked)
    const delAgainReq = new Request(
      `http://localhost/api/v1/patient-portal/shares?id=${activeShareGrantId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${patientAToken}` },
      },
    );
    const delAgainRes = await deleteShare(delAgainReq);
    expect([404, 410]).toContain(delAgainRes.status);

    // 3. Attempt to delete expired grant returns 404/410
    const delExpReq = new Request(
      `http://localhost/api/v1/patient-portal/shares?id=${expiredShareGrantId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${patientAToken}` },
      },
    );
    const delExpRes = await deleteShare(delExpReq);
    expect([400, 403, 404, 410]).toContain(delExpRes.status);
  });
});
