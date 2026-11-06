import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import {
  createPatientPortalSession,
  withTenantClient,
} from '@oncobrief/db';
import { GET, POST, DELETE } from './route';

let fx: Fixtures;
let demo1Token: string;
let caregiverToken: string;
let testCaregiverId: string;

beforeAll(async () => {
  fx = await setupFixtures();

  // Create initial caregiver
  await withTenantClient(
    { orgId: fx.org1, role: 'coordinator', userId: fx.clinicians.coordinator },
    async (q) => {
      const cg = await q.query<{ id: string }>(
        `INSERT INTO caregiver_contact
           (org_id, patient_id, full_name, relationship, phone_number, preferred_locale,
            prefers_voice_note, sync_reminders, consent_recorded_by, is_active)
         VALUES ($1, $2, 'Initial Caregiver', 'Spouse', '+919876543210', 'ta-IN', true, true, $3, true)
         RETURNING id`,
        [fx.org1, fx.patients.demo1, fx.clinicians.coordinator],
      );
      testCaregiverId = cg.rows[0]!.id;
    },
  );

  const pSess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['appointments', 'reminders', 'documents', 'preparation'],
  });
  demo1Token = pSess.token;

  const cgSess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'caregiver',
    caregiverContactId: testCaregiverId,
    grantedScopes: ['appointments', 'reminders'],
  });
  caregiverToken = cgSess.token;
}, 120_000);

describe('MOB-010: Patient Caregiver Consent & Management API (/api/v1/patient-portal/caregivers)', () => {
  const reqCaregiver = (method: string, token: string | undefined, body?: unknown, url = 'http://localhost/api/v1/patient-portal/caregivers') =>
    new Request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  it('rejects unauthenticated request with 401', async () => {
    const res = await GET(reqCaregiver('GET', undefined));
    expect(res.status).toBe(401);
  });

  it('rejects caregiver role attempting to add a new caregiver with 403 (SEC-NEG-13)', async () => {
    const res = await POST(
      reqCaregiver('POST', caregiverToken, {
        fullName: 'Unauthorized Addition',
        relationship: 'Sibling',
        phoneNumber: '+919999999999',
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('patient_role_required');
  });

  it('allows patient to list active caregivers (GET)', async () => {
    const res = await GET(reqCaregiver('GET', demo1Token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.caregivers)).toBe(true);
    expect(body.caregivers.length).toBeGreaterThanOrEqual(1);
    expect(body.caregivers.some((c: { id: string }) => c.id === testCaregiverId)).toBe(true);
  });

  let createdCaregiverId: string;

  it('allows patient to register new caregiver with scopes (POST) (REQ-MOB-032)', async () => {
    const res = await POST(
      reqCaregiver('POST', demo1Token, {
        fullName: 'Kavitha S',
        relationship: 'Daughter',
        phoneNumber: '+919840123456',
        preferredLocale: 'ta-IN',
        syncReminders: true,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.caregiver.id).toBeTruthy();
    expect(body.caregiver.fullName).toBe('Kavitha S');
    expect(body.caregiver.relationship).toBe('Daughter');
    createdCaregiverId = body.caregiver.id;

    // Create an active session for this new caregiver
    const newCgSess = await createPatientPortalSession({
      orgId: fx.org1,
      patientId: fx.patients.demo1,
      actorRole: 'caregiver',
      caregiverContactId: createdCaregiverId,
      grantedScopes: ['appointments'],
    });
    expect(newCgSess.token).toBeTruthy();
  });

  it('revoking caregiver invalidates active sessions in patient_portal_session (DELETE) (SEC-NEG-13)', async () => {
    const res = await DELETE(
      reqCaregiver('DELETE', demo1Token, undefined, `http://localhost/api/v1/patient-portal/caregivers?id=${createdCaregiverId}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.caregiverId).toBe(createdCaregiverId);
    expect(body.revoked).toBe(true);

    // Verify database record has is_active = false
    await withTenantClient(
      { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
      async (q) => {
        const cg = await q.query<{ is_active: boolean }>(
          'SELECT is_active FROM caregiver_contact WHERE id = $1',
          [createdCaregiverId],
        );
        expect(cg.rows[0]!.is_active).toBe(false);

        // Verify active sessions for this caregiver were invalidated!
        const sess = await q.query<{ revoked_at: Date | null }>(
          'SELECT revoked_at FROM patient_portal_session WHERE caregiver_contact_id = $1',
          [createdCaregiverId],
        );
        expect(sess.rows[0]!.revoked_at).not.toBeNull();
      },
    );
  });
});
