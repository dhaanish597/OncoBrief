import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import { createPatientPortalSession } from '@oncobrief/db';
import { PUT } from './route';

let fx: Fixtures;
let patientToken: string;

beforeAll(async () => {
  fx = await setupFixtures();

  const sess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['preparation'],
  });
  patientToken = sess.token;
}, 120_000);

describe('MOB-009: Patient Preparation Sync API (/api/v1/patient-portal/preparation)', () => {
  const reqPrep = (token: string | undefined, body: unknown) =>
    new Request('http://localhost/api/v1/patient-portal/preparation', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it('rejects unauthenticated request with 401', async () => {
    const res = await PUT(reqPrep(undefined, {}));
    expect(res.status).toBe(401);
  });

  it('rejects clinical boundary violation in notes or questions with 422 (SEC-NEG-15)', async () => {
    const res = await PUT(
      reqPrep(patientToken, {
        checks: [{ id: 'c1', done: true }],
        questions: [{ id: 'q1', text: 'What is my prognosis and survival rate?' }],
        symptomNotes: 'Mild fatigue after infusion',
        companionName: 'Son',
        packSelectedDocumentIds: [],
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('clinical_boundary_violation');
  });

  it('successfully updates preparation state (REQ-MOB-025)', async () => {
    const res = await PUT(
      reqPrep(patientToken, {
        checks: [{ id: 'c1', done: true }, { id: 'c2', done: false }],
        questions: [{ id: 'q1', text: 'When should I report mild nausea to the clinic?' }],
        symptomNotes: 'Slight loss of appetite on day 3',
        companionName: 'Daughter',
        packSelectedDocumentIds: [],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.updatedAt).toBeTruthy();
  });
});
