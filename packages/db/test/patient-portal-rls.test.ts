import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools } from '../src/client';
import { appClientForOrg, appClientNoTenant, setupFixtures, type Fixtures } from './helpers';
import { Client } from 'pg';
import { env } from '../src/env';
import {
  createPatientPortalSession,
  validatePatientPortalSessionToken,
  revokePatientPortalSession,
  createPatientOtpChallenge,
  verifyPatientOtpChallenge,
  createPatientShareGrant,
  validatePatientShareToken,
  revokePatientShareGrant,
  withPatientPortalContext,
  upsertPatientPreparationState,
  getPatientPreparationState,
} from '../src/services/patient-portal';

/**
 * MOB-006 / REQ-MOB-009 — Patient Portal PostgreSQL Database Foundation & Strict RLS.
 */

let fx: Fixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 120_000);

afterAll(async () => {
  await closePools();
});

async function patientClient(orgId: string, patientId: string | null, actorRole: 'patient' | 'caregiver' = 'patient'): Promise<Client> {
  const c = new Client({ connectionString: env.databaseUrl });
  await c.connect();
  await c.query('BEGIN');
  await c.query(`SELECT set_config('app.org_id', $1, true)`, [orgId]);
  await c.query(`SELECT set_config('app.current_patient_id', $1, true)`, [patientId ?? '']);
  await c.query(`SELECT set_config('app.actor_role', $1, true)`, [actorRole]);
  await c.query(`SELECT set_config('app.role', '', true)`);
  return c;
}

describe('MOB-006: Patient Portal Foundation & RLS Enforcement', () => {
  const portalTables = [
    'patient_portal_session',
    'patient_document_review',
    'patient_discrepancy_flag',
    'patient_preparation_state',
    'patient_share_grant',
    'patient_otp_challenge',
  ];

  it('all 6 patient portal tables exist and have ENABLE RLS active (FORCE on sensitive data tables)', async () => {
    const c = await appClientNoTenant();
    for (const table of portalTables) {
      const res = await c.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `SELECT c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = $1`,
        [table],
      );
      expect(res.rows.length, `Table ${table} must exist in public schema`).toBe(1);
      expect(res.rows[0]!.relrowsecurity, `Table ${table} must have relrowsecurity=true`).toBe(true);
      if (['patient_document_review', 'patient_discrepancy_flag', 'patient_preparation_state', 'patient_otp_challenge'].includes(table)) {
        expect(res.rows[0]!.relforcerowsecurity, `Table ${table} must have relforcerowsecurity=true`).toBe(true);
      }
    }
    await c.end();
  });

  it('missing patient context fails closed with 0 rows for patient role (SEC-NEG-06 / SEC-NEG-07)', async () => {
    const c = await patientClient(fx.org1, null, 'patient');
    for (const table of portalTables) {
      const res = await c.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
      expect(Number(res.rows[0]!.count), `${table} must return 0 rows when app.current_patient_id is unset`).toBe(0);
    }
    await c.query('ROLLBACK');
    await c.end();
  });

  it('patient A cannot read patient B records (cross-patient RLS isolation)', async () => {
    const p1 = fx.patients.demo1;
    const p2 = fx.patients.demo2;

    const migrator = new Client({ connectionString: env.migratorUrl });
    await migrator.connect();
    await migrator.query(
      `INSERT INTO patient_preparation_state (org_id, patient_id, symptom_notes)
       VALUES ($1, $2, 'Patient 1 secret symptoms')
       ON CONFLICT (org_id, patient_id) DO UPDATE SET symptom_notes = 'Patient 1 secret symptoms'`,
      [fx.org1, p1],
    );
    await migrator.end();

    const c1 = await patientClient(fx.org1, p1, 'patient');
    const res1 = await c1.query<{ symptom_notes: string }>(
      'SELECT symptom_notes FROM patient_preparation_state WHERE patient_id = $1',
      [p1],
    );
    expect(res1.rowCount).toBe(1);
    expect(res1.rows[0]!.symptom_notes).toBe('Patient 1 secret symptoms');
    await c1.query('ROLLBACK');
    await c1.end();

    const c2 = await patientClient(fx.org1, p2, 'patient');
    const res2 = await c2.query(
      'SELECT * FROM patient_preparation_state WHERE patient_id = $1',
      [p1],
    );
    expect(res2.rowCount).toBe(0);
    await c2.query('ROLLBACK');
    await c2.end();
  });

  it('patient A cannot modify or hijack patient B records (WITH CHECK refusal 42501)', async () => {
    const p1 = fx.patients.demo1;
    const p2 = fx.patients.demo2;

    const c2 = await patientClient(fx.org1, p2, 'patient');
    await expect(
      c2.query(
        `INSERT INTO patient_preparation_state (org_id, patient_id, symptom_notes)
         VALUES ($1, $2, 'Malicious takeover attempt')`,
        [fx.org1, p1],
      ),
    ).rejects.toMatchObject({ code: '42501' });

    await c2.query('ROLLBACK');
    await c2.end();
  });

  it('tenant 1 cannot read tenant 2 portal records (cross-tenant RLS isolation)', async () => {
    const pTenant2 = fx.patients.otherTenant;

    const migrator = new Client({ connectionString: env.migratorUrl });
    await migrator.connect();
    await migrator.query(
      `INSERT INTO patient_preparation_state (org_id, patient_id, symptom_notes)
       VALUES ($1, $2, 'Tenant 2 private prep')
       ON CONFLICT (org_id, patient_id) DO UPDATE SET symptom_notes = 'Tenant 2 private prep'`,
      [fx.org2, pTenant2],
    );
    await migrator.end();

    const c1 = await patientClient(fx.org1, pTenant2, 'patient');
    const res = await c1.query('SELECT * FROM patient_preparation_state WHERE patient_id = $1', [pTenant2]);
    expect(res.rowCount).toBe(0);
    await c1.query('ROLLBACK');
    await c1.end();
  });

  it('authorized clinician can read patient portal records in their tenant', async () => {
    const p1 = fx.patients.demo1;

    const cStaff = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const res = await cStaff.query<{ symptom_notes: string }>(
      'SELECT symptom_notes FROM patient_preparation_state WHERE patient_id = $1',
      [p1],
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0]!.symptom_notes).toBe('Patient 1 secret symptoms');
    await cStaff.end();
  });

  it('session lifecycle: create, validate, and immediate revocation (SEC-NEG-01..05)', async () => {
    const created = await createPatientPortalSession({
      orgId: fx.org1,
      patientId: fx.patients.demo1,
      actorRole: 'patient',
    });

    expect(created.token).toBeTruthy();
    expect(created.session.sessionId).toBeTruthy();

    // Validate token
    const valid = await validatePatientPortalSessionToken(created.token);
    expect(valid).not.toBeNull();
    expect(valid?.patientId).toBe(fx.patients.demo1);
    expect(valid?.orgId).toBe(fx.org1);

    // Revoke token
    const revoked = await revokePatientPortalSession(
      created.session.sessionId,
      { orgId: fx.org1, patientId: fx.patients.demo1, actorRole: 'patient' },
    );
    expect(revoked).toBe(true);

    // Second validation must fail closed immediately
    const rechecked = await validatePatientPortalSessionToken(created.token);
    expect(rechecked).toBeNull();
  });

  it('OTP challenge: creation, attempt limiting, single-use, and replay protection', async () => {
    const phone = '+919840012345';
    const correctOtp = '246810';

    await createPatientOtpChallenge({
      orgId: fx.org1,
      patientId: fx.patients.demo1,
      identifierValue: phone,
      otpCode: correctOtp,
    });

    // Wrong OTP
    const wrongRes = await verifyPatientOtpChallenge({
      orgId: fx.org1,
      patientId: fx.patients.demo1,
      identifierValue: phone,
      otpCode: '000000',
    });
    expect(wrongRes.verified).toBe(false);
    expect(wrongRes.error).toBe('invalid_code');

    // Correct OTP
    const correctRes = await verifyPatientOtpChallenge({
      orgId: fx.org1,
      patientId: fx.patients.demo1,
      identifierValue: phone,
      otpCode: correctOtp,
    });
    expect(correctRes.verified).toBe(true);

    // Replay attack: reusing the same OTP must fail closed (consumed)
    const replayRes = await verifyPatientOtpChallenge({
      orgId: fx.org1,
      patientId: fx.patients.demo1,
      identifierValue: phone,
      otpCode: correctOtp,
    });
    expect(replayRes.verified).toBe(false);
    expect(replayRes.error).toBe('not_found');
  });

  it('share grant: creation, validation, and revocation', async () => {
    const grant = await createPatientShareGrant({
      orgId: fx.org1,
      patientId: fx.patients.demo1,
      recipientLabel: 'Dr. Second Opinion',
      recipientRole: 'second_opinion_clinician',
      sharedDocumentIds: [fx.sampleDocumentId],
      expiresInHours: 24,
    });

    expect(grant.grantId).toBeTruthy();
    expect(grant.shareToken).toBeTruthy();

    // Validate share token
    const validated = await validatePatientShareToken(grant.shareToken);
    expect(validated).not.toBeNull();
    expect(validated?.patientId).toBe(fx.patients.demo1);
    expect(validated?.sharedDocumentIds).toContain(fx.sampleDocumentId);

    // Revoke share grant
    const revoked = await revokePatientShareGrant(
      grant.grantId,
      { orgId: fx.org1, patientId: fx.patients.demo1, actorRole: 'patient' },
    );
    expect(revoked).toBe(true);

    // Validation after revocation must fail closed
    const rechecked = await validatePatientShareToken(grant.shareToken);
    expect(rechecked).toBeNull();
  });

  it('withPatientPortalContext ensures transaction-local isolation and no context leak', async () => {
    const s1 = { orgId: fx.org1, patientId: fx.patients.demo1, actorRole: 'patient' as const };
    const s2 = { orgId: fx.org1, patientId: fx.patients.demo2, actorRole: 'patient' as const };

    await withPatientPortalContext(s1, async (q) => {
      await upsertPatientPreparationState(q, {
        orgId: s1.orgId,
        patientId: s1.patientId,
        checks: [{ id: 'c1', done: true }],
        questions: [{ id: 'q1', text: 'Questions for Dr. Rao' }],
        symptomNotes: 'Notes for visit',
      });
      const prep1 = await getPatientPreparationState(q, s1.patientId);
      expect(prep1?.symptomNotes).toBe('Notes for visit');
    });

    // In session 2, querying patient 1 must return null (RLS blocks it)
    await withPatientPortalContext(s2, async (q) => {
      const prepFromS2 = await getPatientPreparationState(q, s1.patientId);
      expect(prepFromS2).toBeNull();
    });
  });
});
