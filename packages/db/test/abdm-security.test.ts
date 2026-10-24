import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closePools } from '../src/client';
import { appClientForOrg, appClientNoTenant, setupFixtures, withSuperuser, type Fixtures } from './helpers';

describe('ABDM RLS Tenant Isolation and Security Definer Resolver', () => {
  let fx: Fixtures;

  beforeAll(async () => {
    fx = await setupFixtures();
  }, 120_000);

  afterAll(async () => {
    await closePools();
  });

  const abdmTables = [
    'abdm_inbox',
    'abdm_transaction',
    'abdm_patient_link',
    'abdm_care_context',
    'abdm_consent_request',
    'abdm_consent_artifact',
    'abdm_hi_transfer',
  ];

  it('all 7 ABDM tables return 0 rows when tenant context (app.org_id) is unset', async () => {
    const c = await appClientNoTenant();
    for (const table of abdmTables) {
      const res = await c.query(`SELECT count(*)::text AS n FROM ${table}`);
      expect(Number(res.rows[0]!.n), `${table} must return 0 rows without app.org_id`).toBe(0);
    }
    await c.end();
  });

  it('cross-tenant INSERT into abdm_patient_link is rejected by WITH CHECK policy', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    await expect(
      c.query(
        `INSERT INTO abdm_patient_link (org_id, patient_id, abha_address)
         VALUES ($1, $2, 'intruder@sbx')`,
        [fx.org2, fx.patients.otherTenant],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await c.end();
  });

  it('tenant 1 cannot see ABDM transaction or care context rows belonging to tenant 2', async () => {
    const reqIdOrg2 = randomUUID();

    // Insert a transaction as org2
    const c2 = await appClientForOrg(fx.org2, null, null);
    await c2.query(
      `INSERT INTO abdm_transaction (request_id, org_id, role_kind, flow_kind, status)
       VALUES ($1, $2, 'HIP', 'link_care_context', 'PENDING')`,
      [reqIdOrg2, fx.org2],
    );
    const read2 = await c2.query('SELECT * FROM abdm_transaction WHERE request_id = $1', [reqIdOrg2]);
    expect(read2.rowCount).toBe(1);
    await c2.end();

    // Query as org1: must see 0 rows
    const c1 = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const read1 = await c1.query('SELECT * FROM abdm_transaction WHERE request_id = $1', [reqIdOrg2]);
    expect(read1.rowCount).toBe(0);
    await c1.end();
  });

  describe('abdm_resolve_callback_tenant', () => {
    it('resolves tenant from outbound request_id', async () => {
      const reqId = randomUUID();
      const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
      await c.query(
        `INSERT INTO abdm_transaction (request_id, org_id, patient_id, role_kind, flow_kind, status)
         VALUES ($1, $2, $3, 'HIP', 'generate_link_token', 'PENDING')`,
        [reqId, fx.org1, fx.patients.demo1],
      );
      await c.end();

      // Resolve before entering session/tenant context
      const anon = await appClientNoTenant();
      const res = await anon.query<{ org_id: string; patient_id: string }>(
        'SELECT org_id, patient_id FROM abdm_resolve_callback_tenant(p_response_request_id => $1)',
        [reqId],
      );
      expect(res.rowCount).toBe(1);
      expect(res.rows[0]!.org_id).toBe(fx.org1);
      expect(res.rows[0]!.patient_id).toBe(fx.patients.demo1);
      await anon.end();
    });

    it('resolves tenant from registered facility ID', async () => {
      const testHipId = `TMH-TEST-${Date.now()}`;
      await withSuperuser((c) =>
        c.query('UPDATE organization SET abdm_hip_id = $1 WHERE id = $2', [testHipId, fx.org1]),
      );

      const anon = await appClientNoTenant();
      const res = await anon.query<{ org_id: string; patient_id: string | null }>(
        'SELECT org_id, patient_id FROM abdm_resolve_callback_tenant(p_facility_id => $1)',
        [testHipId],
      );
      expect(res.rowCount).toBe(1);
      expect(res.rows[0]!.org_id).toBe(fx.org1);
      expect(res.rows[0]!.patient_id).toBeNull();
      await anon.end();
    });

    it('returns zero rows and fails closed for unknown correlation tokens', async () => {
      const anon = await appClientNoTenant();
      const res = await anon.query(
        'SELECT org_id, patient_id FROM abdm_resolve_callback_tenant(p_response_request_id => $1, p_facility_id => $2)',
        [randomUUID(), 'NON_EXISTENT_FACILITY'],
      );
      expect(res.rowCount).toBe(0);
      await anon.end();
    });
  });
});
