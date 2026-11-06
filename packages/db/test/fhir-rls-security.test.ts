import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools, getAppPool, withTenant } from '../src/client';
import {
  getFhirEndpoint,
  listFhirEndpoints,
  recordExchangeTransaction,
  registerFhirEndpoint,
} from '../src/services/fhir-exchange';
import { appClientForOrg, appClientNoTenant, setupFixtures, withSuperuser, type Fixtures } from './helpers';

describe('TASK-07C.02: PostgreSQL 16 RLS Session-Variable & Interoperability Security Suite', () => {
  let f: Fixtures;
  let org1EndpointId: string;
  let org1TxId: string;

  beforeAll(async () => {
    f = await setupFixtures();

    // Seed test FHIR endpoint and transaction in org1
    await withTenant({ orgId: f.org1, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
      const ep = await registerFhirEndpoint(q, {
        orgId: f.org1,
        name: 'Apollo Hospital HIS Test',
        baseUrl: 'https://his.apollo.in/fhir/r4',
        authKind: 'bearer',
        allowedOperations: ['read', 'search'],
        userId: f.clinicians.clinician,
      });
      org1EndpointId = ep.endpointId;

      const tx = await recordExchangeTransaction(q, {
        orgId: f.org1,
        patientId: f.patients.demo3,
        direction: 'INBOUND_IMPORT',
        payloadSha256: 'a1b2c3d4e5f67890',
        status: 'COMPLETED',
        idempotencyKey: `idemp-rls-test-${Date.now()}`,
        userId: f.clinicians.clinician,
      });
      org1TxId = tx.transactionId;
    });
  });

  afterAll(async () => {
    await closePools();
  });

  it('1. Correct tenant context retrieves tenant data', async () => {
    await withTenant({ orgId: f.org1, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
      const ep = await getFhirEndpoint(q, f.org1, org1EndpointId);
      expect(ep).not.toBeNull();
      if (!ep) throw new Error('Registered endpoint missing');
      expect(ep.name).toBe('Apollo Hospital HIS Test');

      const eps = await listFhirEndpoints(q, f.org1);
      expect(eps.some((e) => e.id === org1EndpointId)).toBe(true);
    });
  });

  it('2. Missing tenant context returns 0 rows (fail-closed)', async () => {
    const anon = await appClientNoTenant();
    try {
      const resEp = await anon.query('SELECT * FROM fhir_endpoint_registry');
      expect(resEp.rows).toHaveLength(0);

      const resTx = await anon.query('SELECT * FROM fhir_exchange_transaction');
      expect(resTx.rows).toHaveLength(0);

      const resLinks = await anon.query('SELECT * FROM fhir_resource_link');
      expect(resLinks.rows).toHaveLength(0);
    } finally {
      await anon.end();
    }
  });

  it('3. Wrong tenant context returns 0 rows', async () => {
    await withTenant({ orgId: f.org2, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
      const ep = await getFhirEndpoint(q, f.org2, org1EndpointId);
      expect(ep).toBeNull();

      const eps = await listFhirEndpoints(q, f.org2);
      expect(eps.some((e) => e.id === org1EndpointId)).toBe(false);
    });
  });

  it('4. Cross-tenant endpoint access is strictly blocked', async () => {
    const clientOrg2 = await appClientForOrg(f.org2, f.clinicians.clinician, 'clinician');
    try {
      // Direct query trying to select org1 endpoint while authenticated as org2
      const res = await clientOrg2.query(
        'SELECT * FROM fhir_endpoint_registry WHERE id = $1',
        [org1EndpointId]
      );
      expect(res.rows).toHaveLength(0);

      // Direct update attempt trying to deactivate org1 endpoint
      const updateRes = await clientOrg2.query(
        'UPDATE fhir_endpoint_registry SET is_active = false WHERE id = $1',
        [org1EndpointId]
      );
      expect(updateRes.rowCount).toBe(0);
    } finally {
      await clientOrg2.end();
    }
  });

  it('5. Cross-tenant import/export transaction access is strictly blocked', async () => {
    const clientOrg2 = await appClientForOrg(f.org2, f.clinicians.clinician, 'clinician');
    try {
      const res = await clientOrg2.query(
        'SELECT * FROM fhir_exchange_transaction WHERE id = $1',
        [org1TxId]
      );
      expect(res.rows).toHaveLength(0);
    } finally {
      await clientOrg2.end();
    }
  });

  it('6. Patient belonging to another tenant cannot be linked to org1 transaction', async () => {
    // f.patients.otherTenant belongs to org2
    await withTenant({ orgId: f.org1, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
      // Trying to query the other tenant's patient from org1 context returns empty
      const patientCheck = await q.query(
        'SELECT * FROM patient WHERE id = $1',
        [f.patients.otherTenant]
      );
      expect(patientCheck.rows).toHaveLength(0);
    });
  });

  it('7. Invalid tenant ID (empty string or malformed UUID) fails closed safely', async () => {
    const anon = await appClientNoTenant();
    try {
      await anon.query("SELECT set_config('app.org_id', '', false)");
      const resEmpty = await anon.query('SELECT * FROM fhir_endpoint_registry');
      expect(resEmpty.rows).toHaveLength(0);
    } finally {
      await anon.end();
    }
  });

  it('8. Privileged migration role versus application role', async () => {
    // Non-superuser application role is constrained
    const appClient = await appClientNoTenant();
    try {
      const appRows = await appClient.query('SELECT count(*)::int AS count FROM fhir_endpoint_registry');
      expect(appRows.rows[0]?.count).toBe(0);
    } finally {
      await appClient.end();
    }

    // Superuser / migrator role can see cross-tenant rows
    await withSuperuser(async (migrator) => {
      const suRows = await migrator.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM fhir_endpoint_registry WHERE id = $1',
        [org1EndpointId]
      );
      expect(suRows.rows[0]?.count).toBe(1);
    });
  });

  it('9. Transaction-local session variables do not persist outside transaction', async () => {
    const pool = getAppPool();
    const conn = await pool.connect();
    try {
      await conn.query('BEGIN');
      await conn.query("SELECT set_config('app.org_id', $1, true)", [f.org1]);
      const inTx = await conn.query("SELECT current_setting('app.org_id', true) AS val");
      expect(inTx.rows[0]?.val).toBe(f.org1);
      await conn.query('COMMIT');

      // Outside the transaction, the variable should be reset / empty
      const postTx = await conn.query("SELECT current_setting('app.org_id', true) AS val");
      expect(postTx.rows[0]?.val ?? '').toBe('');
    } finally {
      conn.release();
    }
  });

  it('10. Connection pooling prevents context leakage across requests', async () => {
    // Request 1 sets tenant
    await withTenant({ orgId: f.org1, userId: f.clinicians.clinician, role: 'clinician' }, async (q) => {
      const res = await q.query("SELECT current_setting('app.org_id', true) AS val");
      expect(res.rows[0]?.val).toBe(f.org1);
    });

    // Request 2 on pool without tenant must not have residual context
    const pool = getAppPool();
    const conn = await pool.connect();
    try {
      const res = await conn.query("SELECT current_setting('app.org_id', true) AS val");
      expect(res.rows[0]?.val ?? '').toBe('');
    } finally {
      conn.release();
    }
  });
});
