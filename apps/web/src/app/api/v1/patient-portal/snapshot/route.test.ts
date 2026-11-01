import { beforeAll, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import {
  createPatientPortalSession,
  revokePatientPortalSession,
  withTenantClient,
} from '@oncobrief/db';
import { GET } from './route';

let fx: Fixtures;
let patientToken: string;
let caregiverToken: string;
let expiredToken: string;
let revokedToken: string;

beforeAll(async () => {
  fx = await setupFixtures();

  // Create normal patient session with full scopes
  const patientSess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    grantedScopes: ['appointments', 'reminders', 'documents', 'preparation'],
  });
  patientToken = patientSess.token;

  // Create caregiver session with limited scope: only 'appointments' (SEC-NEG-16)
  const caregiverSess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'caregiver',
    grantedScopes: ['appointments'],
  });
  caregiverToken = caregiverSess.token;

  // Create expired session
  const expiredSess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
    expiresInMs: -1000,
  });
  expiredToken = expiredSess.token;

  // Create revoked session
  const revokedSess = await createPatientPortalSession({
    orgId: fx.org1,
    patientId: fx.patients.demo1,
    actorRole: 'patient',
  });
  revokedToken = revokedSess.token;
  await revokePatientPortalSession(revokedSess.session.sessionId, revokedSess.session);
}, 120_000);

describe('MOB-008: Patient Portal Snapshot API (/api/v1/patient-portal/snapshot)', () => {
  const reqGet = (token?: string) =>
    new Request('http://localhost/api/v1/patient-portal/snapshot', {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  it('rejects unauthenticated request with 401 (SEC-NEG-01)', async () => {
    const res = await GET(reqGet());
    expect(res.status).toBe(401);
  });

  it('rejects expired session token with 401 (SEC-NEG-02)', async () => {
    const res = await GET(reqGet(expiredToken));
    expect(res.status).toBe(401);
  });

  it('rejects revoked session token with 401 (SEC-NEG-03)', async () => {
    const res = await GET(reqGet(revokedToken));
    expect(res.status).toBe(401);
  });

  it('returns complete snapshot for authenticated patient (REQ-MOB-011)', async () => {
    const res = await GET(reqGet(patientToken));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.patient).toBeDefined();
    expect(body.patient.id).toBe(fx.patients.demo1);
    expect(body.patient.demoCode).toBe('DEMO-001');
    expect(Array.isArray(body.appointments)).toBe(true);
    expect(Array.isArray(body.documents)).toBe(true);
    expect(Array.isArray(body.timeline)).toBe(true);
    expect(Array.isArray(body.missingDocumentTasks)).toBe(true);
    expect(Array.isArray(body.continuityMessages)).toBe(true);
  });

  it('completely excludes draft or unapproved continuity messages (SEC-NEG-11)', async () => {
    // Insert a draft message for DEMO-001
    await withTenantClient(
      { orgId: fx.org1, role: 'clinician', userId: fx.clinicians.clinician },
      async (q) => {
        // Find a template
        const tmpl = await q.query<{ id: string }>('SELECT id FROM message_template LIMIT 1');
        if (tmpl.rowCount && tmpl.rowCount > 0) {
          await q.query(
            `INSERT INTO patient_message (
               org_id, patient_id, template_id, locale, variables_json,
               body_rendered, status, composed_by
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              fx.org1,
              fx.patients.demo1,
              tmpl.rows[0]!.id,
              'en-IN',
              JSON.stringify({ note: 'secret draft' }),
              'Secret draft message that patient must not see',
              'draft',
              fx.clinicians.clinician,
            ],
          );
        }
      },
    );

    const res = await GET(reqGet(patientToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const msg of body.continuityMessages) {
      expect(msg.bodyRendered).not.toContain('Secret draft message');
    }
  });

  it('redacts documents and preparation when caregiver lacks scopes (SEC-NEG-16)', async () => {
    const res = await GET(reqGet(caregiverToken));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.appointments).toBeDefined();
    // documents should be redacted to empty array
    expect(body.documents).toEqual([]);
    // preparation should be redacted to null
    expect(body.preparation).toBeNull();
  });
});
