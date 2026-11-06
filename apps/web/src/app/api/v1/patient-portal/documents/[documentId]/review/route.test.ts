import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import {
  createPatientPortalSession,
  withTenantClient,
} from '@oncobrief/db';
import { POST } from './route';

let fx: Fixtures;
let demo1Token: string;
let demo1DocId: string;
let demo2DocId: string;

beforeAll(async () => {
  fx = await setupFixtures();

  await withTenantClient(
    { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
    async (q) => {
      const d1 = await q.query<{ id: string }>(
        'SELECT id FROM document WHERE patient_id = $1 AND org_id = $2 LIMIT 1',
        [fx.patients.demo1, fx.org1],
      );
      demo1DocId = d1.rows[0]!.id;

      const d2 = await q.query<{ id: string }>(
        'SELECT id FROM document WHERE patient_id = $1 AND org_id = $2 LIMIT 1',
        [fx.patients.demo2, fx.org1],
      );
      demo2DocId = d2.rows[0]!.id;
    },
  );

  const sess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['documents'],
  });
  demo1Token = sess.token;
}, 120_000);

describe('MOB-009: Patient Document Review API (/api/v1/patient-portal/documents/[id]/review)', () => {
  const reqReview = (token: string | undefined, body: unknown) =>
    new Request('http://localhost/api/v1/patient-portal/documents/any/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it('rejects unauthenticated request with 401', async () => {
    const res = await POST(reqReview(undefined, {}), {
      params: Promise.resolve({ documentId: demo1DocId }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects review on another patient document with 404', async () => {
    const res = await POST(reqReview(demo1Token, {}), {
      params: Promise.resolve({ documentId: demo2DocId }),
    });
    expect(res.status).toBe(404);
  });

  it('records patient review without elevating clinician verification (SEC-NEG-10, REQ-MOB-017)', async () => {
    // Malicious body attempting to elevate document to 'verified'
    const res = await POST(
      reqReview(demo1Token, {
        reviewStatus: 'reviewed',
        status: 'verified',
        clinicianVerified: true,
        ingest_status: 'verified',
      }),
      { params: Promise.resolve({ documentId: demo1DocId }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documentId).toBe(demo1DocId);
    expect(body.reviewStatus).toBe('confirmed_by_patient');

    // Verify document table status did NOT elevate to 'verified'
    await withTenantClient(
      { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
      async (q) => {
        const doc = await q.query<{ ingest_status: string }>(
          'SELECT ingest_status FROM document WHERE id = $1',
          [demo1DocId],
        );
        expect(doc.rows[0]!.ingest_status).not.toBe('verified');
      },
    );
  });
});
