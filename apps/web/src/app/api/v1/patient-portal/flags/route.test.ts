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

describe('MOB-009: Patient Discrepancy Flagging API (/api/v1/patient-portal/flags)', () => {
  const reqFlag = (token: string | undefined, body: unknown) =>
    new Request('http://localhost/api/v1/patient-portal/flags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it('rejects unauthenticated request with 401', async () => {
    const res = await POST(reqFlag(undefined, {}));
    expect(res.status).toBe(401);
  });

  it('rejects cross-patient document flag with 404 (SEC-NEG-07)', async () => {
    // Patient DEMO-001 attempts to flag Patient DEMO-002 document
    const res = await POST(
      reqFlag(demo1Token, {
        documentId: demo2DocId,
        fieldName: 'date',
        patientReason: 'This date is wrong',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('rejects clinical boundary violation in reason with 422', async () => {
    const res = await POST(
      reqFlag(demo1Token, {
        documentId: demo1DocId,
        fieldName: 'other',
        patientReason: 'Please change my triage risk_score immediately',
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('clinical_boundary_violation');
  });

  it('successfully creates discrepancy flag and linked reconciliation task (REQ-MOB-018)', async () => {
    const res = await POST(
      reqFlag(demo1Token, {
        documentId: demo1DocId,
        fieldName: 'facility',
        patientReason: 'The issuing hospital listed is incorrect, test was done at Apex Labs',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.flagId).toBeTruthy();
    expect(body.documentId).toBe(demo1DocId);
    expect(body.taskId).toBeTruthy();
    expect(body.status).toBe('open');
  });
});
