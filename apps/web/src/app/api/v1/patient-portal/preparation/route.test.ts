import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as db from '@oncobrief/db';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import { createPatientPortalSession, withTenantClient } from '@oncobrief/db';
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

    // Check a fresh transaction: a response assembled before COMMIT cannot
    // establish that preparation or its audit entry was actually persisted.
    await withTenantClient(
      { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
      async (q) => {
        const stored = await q.query<{
          id: string;
          questions_json: Array<{ id: string; text: string }>;
          symptom_notes: string;
        }>(
          `SELECT id, questions_json, symptom_notes FROM patient_preparation_state
           WHERE org_id = $1 AND patient_id = $2`,
          [fx.org1, fx.patients.demo1],
        );
        expect(stored.rows).toHaveLength(1);
        expect(stored.rows[0]).toMatchObject({
          id: body.id,
          questions_json: [{ id: 'q1', text: 'When should I report mild nausea to the clinic?' }],
          symptom_notes: 'Slight loss of appetite on day 3',
        });

        const audit = await q.query<{
          actor_user_id: string | null;
          actor_role: string;
          metadata_json: Record<string, unknown>;
        }>(
          `SELECT actor_user_id, actor_role, metadata_json FROM audit_event
           WHERE org_id = $1 AND entity_kind = 'patient_preparation_state'
             AND entity_id = $2 AND action = 'patient.updated'`,
          [fx.org1, body.id],
        );
        expect(audit.rows).toHaveLength(1);
        expect(audit.rows[0]).toMatchObject({
          actor_user_id: null,
          actor_role: 'patient',
          metadata_json: {
            patientId: fx.patients.demo1,
            caregiverContactId: null,
            checksCount: 2,
            questionsCount: 1,
          },
        });
      },
    );
  });

  it('rolls back preparation and does not report success when audit writing fails', async () => {
    const baseline = await PUT(reqPrep(patientToken, { symptomNotes: 'Original persisted notes' }));
    expect(baseline.status).toBe(200);

    const auditFailure = vi.spyOn(db, 'appendAuditEvent').mockRejectedValueOnce(new Error('audit unavailable'));
    try {
      await expect(PUT(reqPrep(patientToken, {
        questions: [{ id: 'unsaved', text: 'Which documents should I bring?' }],
        symptomNotes: 'This failed update must not persist',
      }))).rejects.toThrow('audit unavailable');
    } finally {
      auditFailure.mockRestore();
    }

    await withTenantClient(
      { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
      async (q) => {
        const stored = await q.query<{ symptom_notes: string }>(
          `SELECT symptom_notes FROM patient_preparation_state
           WHERE org_id = $1 AND patient_id = $2`,
          [fx.org1, fx.patients.demo1],
        );
        expect(stored.rows[0]?.symptom_notes).toBe('Original persisted notes');
      },
    );
  });
});
