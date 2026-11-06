import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import {
  createPatientPortalSession,
  withTenantClient,
} from '@oncobrief/db';
import { POST } from './route';

let fx: Fixtures;
let demo1Token: string;
let caregiverToken: string;
let demo1ApptId: string;
let demo2ApptId: string;

beforeAll(async () => {
  fx = await setupFixtures();

  // Create appointments for DEMO-001 and DEMO-002
  await withTenantClient(
    { orgId: fx.org1, role: 'coordinator', userId: fx.clinicians.coordinator },
    async (q) => {
      // Find a clinic slot or clinician
      const clinicianId = fx.clinicians.clinician;
      const appt1 = await q.query<{ id: string }>(
        `INSERT INTO appointment
           (org_id, patient_id, clinician_id, scheduled_start, scheduled_end, status, created_by)
         VALUES ($1, $2, $3, now() + interval '1 day', now() + interval '1 day 30 minutes', 'scheduled', $4)
         RETURNING id`,
        [fx.org1, fx.patients.demo1, clinicianId, fx.clinicians.coordinator],
      );
      demo1ApptId = appt1.rows[0]!.id;

      const appt2 = await q.query<{ id: string }>(
        `INSERT INTO appointment
           (org_id, patient_id, clinician_id, scheduled_start, scheduled_end, status, created_by)
         VALUES ($1, $2, $3, now() + interval '2 days', now() + interval '2 days 30 minutes', 'scheduled', $4)
         RETURNING id`,
        [fx.org1, fx.patients.demo2, clinicianId, fx.clinicians.coordinator],
      );
      demo2ApptId = appt2.rows[0]!.id;
    },
  );

  const pSess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['appointments', 'reminders'],
  });
  demo1Token = pSess.token;

  const cgSess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'caregiver',
    grantedScopes: ['documents'], // Missing appointments scope!
  });
  caregiverToken = cgSess.token;
}, 120_000);

describe('MOB-010: Patient Appointment Attendance API (/api/v1/patient-portal/attendance)', () => {
  const reqAtt = (token: string | undefined, body: unknown) =>
    new Request('http://localhost/api/v1/patient-portal/attendance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it('rejects unauthenticated request with 401', async () => {
    const res = await POST(reqAtt(undefined, { appointmentId: demo1ApptId, action: 'confirm' }));
    expect(res.status).toBe(401);
  });

  it('rejects caregiver missing appointments scope with 403', async () => {
    const res = await POST(reqAtt(caregiverToken, { appointmentId: demo1ApptId, action: 'confirm' }));
    expect(res.status).toBe(403);
  });

  it('rejects cross-patient appointment attendance confirmation with 404 (SEC-NEG-06)', async () => {
    const res = await POST(reqAtt(demo1Token, { appointmentId: demo2ApptId, action: 'confirm' }));
    expect(res.status).toBe(404);
  });

  it('successfully confirms attendance transitioning status to confirmed (REQ-MOB-021)', async () => {
    const res = await POST(reqAtt(demo1Token, { appointmentId: demo1ApptId, action: 'confirm' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.appointmentId).toBe(demo1ApptId);
    expect(body.status).toBe('confirmed');

    // Verify appointment status updated in database
    await withTenantClient(
      { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
      async (q) => {
        const appt = await q.query<{ status: string }>(
          'SELECT status FROM appointment WHERE id = $1',
          [demo1ApptId],
        );
        expect(appt.rows[0]!.status).toBe('confirmed');

        const hist = await q.query<{ from_status: string; to_status: string }>(
          'SELECT from_status, to_status FROM appointment_status_history WHERE appointment_id = $1 ORDER BY occurred_at DESC LIMIT 1',
          [demo1ApptId],
        );
        expect(hist.rows[0]!.from_status).toBe('scheduled');
        expect(hist.rows[0]!.to_status).toBe('confirmed');
      },
    );
  });

  it('creates coordinator administrative task on request_reschedule (REQ-MOB-021)', async () => {
    const res = await POST(
      reqAtt(demo1Token, {
        appointmentId: demo1ApptId,
        action: 'request_reschedule',
        preferredDateWindow: 'Next Tuesday morning after 10 AM',
        note: 'Have severe chemotherapy fatigue this Monday',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.taskId).toBeTruthy();
    expect(body.action).toBe('request_reschedule');

    // Verify admin_task was created
    await withTenantClient(
      { orgId: fx.org1, role: 'coordinator', userId: fx.clinicians.coordinator },
      async (q) => {
        const t = await q.query<{ id: string; title: string; detail: string }>(
          'SELECT id, title, detail FROM admin_task WHERE id = $1',
          [body.taskId],
        );
        expect(t.rows.length).toBe(1);
        expect(t.rows[0]!.detail).toContain('Next Tuesday morning after 10 AM');
      },
    );
  });
});
