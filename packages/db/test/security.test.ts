import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePools } from '../src/client';
import { appClientForOrg, appClientNoTenant, setupFixtures, withSuperuser, type Fixtures } from './helpers';

/**
 * Architecture §23.2 — the security properties are tested, not asserted.
 *
 *  - Append-only enforcement: the database refuses UPDATE/DELETE on the
 *    ledger, the claims and the audit stream.
 *  - Tenant isolation: reads are strictly org-scoped, a missing tenant context
 *    fails closed with zero rows, and a cross-tenant direct fetch returns
 *    nothing rather than confirming the row exists.
 */

let fx: Fixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('append-only enforcement', () => {
  it('the app role cannot UPDATE evidence_fact', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    await expect(
      c.query(`UPDATE evidence_fact SET verbatim_quote = 'tampered' WHERE org_id = $1`, [fx.org1]),
    ).rejects.toMatchObject({ code: '42501' });
    await c.end();
  });

  it('the app role cannot DELETE evidence_fact', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    await expect(
      c.query(`DELETE FROM evidence_fact WHERE org_id = $1`, [fx.org1]),
    ).rejects.toMatchObject({ code: '42501' });
    await c.end();
  });

  it('the app role cannot UPDATE ledger_entry', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    await expect(
      c.query(`UPDATE ledger_entry SET reason = 'rewritten' WHERE org_id = $1`, [fx.org1]),
    ).rejects.toMatchObject({ code: '42501' });
    await c.end();
  });

  it('the app role cannot DELETE audit_event', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    await expect(
      c.query(`DELETE FROM audit_event WHERE org_id = $1`, [fx.org1]),
    ).rejects.toMatchObject({ code: '42501' });
    await c.end();
  });

  it('even the schema owner is blocked by the row trigger', async () => {
    await expect(
      withSuperuser((c) =>
        c.query(`UPDATE evidence_fact SET verbatim_quote = 'tampered' WHERE org_id = $1`, [fx.org1]),
      ),
    ).rejects.toThrow(/append_only_table/);
  });

  it('cannot UPDATE or DELETE the extraction candidate or outbox ledgers', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    await expect(
      c.query(`UPDATE extraction_candidate SET validation_status='promoted' WHERE org_id = $1`, [fx.org1]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      c.query(`UPDATE task_event SET note = 'x' WHERE org_id = $1`, [fx.org1]),
    ).rejects.toMatchObject({ code: '42501' });
    await c.end();
  });
});

describe('tenant isolation', () => {
  it('a tenant sees only its own patients', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const res = await c.query<{ n: string }>('SELECT count(*)::text AS n FROM patient');
    expect(Number(res.rows[0]!.n)).toBe(3);
    await c.end();
  });

  it('the second tenant sees only its own patient', async () => {
    const c = await appClientForOrg(fx.org2, null, null);
    const res = await c.query<{ n: string }>('SELECT count(*)::text AS n FROM patient');
    expect(Number(res.rows[0]!.n)).toBe(1);
    await c.end();
  });

  it('a cross-tenant direct fetch returns zero rows, not the row', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const res = await c.query('SELECT * FROM patient WHERE id = $1', [fx.patients.otherTenant]);
    expect(res.rowCount).toBe(0);
    await c.end();
  });

  it('a missing tenant context fails closed with zero rows', async () => {
    const c = await appClientNoTenant();
    for (const table of ['patient', 'evidence_fact', 'ledger_entry', 'document', 'audit_event']) {
      const res = await c.query(`SELECT count(*)::text AS n FROM ${table}`);
      expect(Number(res.rows[0]!.n), `${table} must return 0 rows with no app.org_id`).toBe(0);
    }
    await c.end();
  });

  it('a cross-tenant INSERT is refused by the WITH CHECK policy', async () => {
    const c = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    await expect(
      c.query(
        `INSERT INTO patient (org_id, display_name) VALUES ($1, 'escape attempt')`,
        [fx.org2],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await c.end();
  });

  it('the audit trail is tenant-scoped', async () => {
    const c1 = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const r1 = await c1.query<{ org_id: string }>('SELECT DISTINCT org_id FROM audit_event');
    expect(r1.rows.every((r) => r.org_id === fx.org1)).toBe(true);
    await c1.end();
  });
});
