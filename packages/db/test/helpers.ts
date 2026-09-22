import { Client, type PoolClient } from 'pg';
import { env } from '../src/env';
import { getMigratorPool } from '../src/client';
import { migrate } from '../src/migrate';
import { seed } from '../src/seed';
import type { Role } from '@oncobrief/domain';

export interface Fixtures {
  org1: string;
  org2: string;
  clinicians: Record<Role, string>;
  patients: { demo1: string; demo2: string; demo3: string; otherTenant: string };
  /** A verified fact owned by DEMO-003, safe to read. */
  readyFactId: string;
  /** A document + span belonging to DEMO-003, for creating test facts. */
  sampleDocumentId: string;
  sampleSpanId: string;
  sampleSpanText: string;
}

let cached: Fixtures | null = null;

export async function setupFixtures(): Promise<Fixtures> {
  if (cached) return cached;
  await migrate();
  await seed();

  const pool = getMigratorPool();
  const org = await pool.query<{ slug: string; id: string }>('SELECT slug, id FROM organization');
  const org1 = org.rows.find((o) => o.slug === 'rci')!.id;
  const org2 = org.rows.find((o) => o.slug === 'northgate')!.id;

  const members = await pool.query<{ role: Role; user_id: string }>(
    'SELECT role, user_id FROM membership WHERE org_id = $1',
    [org1],
  );
  const clinicians = Object.fromEntries(members.rows.map((m) => [m.role, m.user_id])) as Record<Role, string>;

  const patients = await pool.query<{ demo_code: string; id: string; org_id: string }>(
    'SELECT demo_code, id, org_id FROM patient',
  );
  const find = (code: string, oid: string) =>
    patients.rows.find((p) => p.demo_code === code && p.org_id === oid)!.id;

  const sample = await pool.query<{ document_id: string; id: string; text: string }>(
    `SELECT ts.document_id, ts.id, ts.text
       FROM text_span ts JOIN document d ON d.id = ts.document_id
      WHERE d.patient_id = $1 AND length(ts.text) > 20
      ORDER BY ts.span_index LIMIT 1`,
    [find('DEMO-003', org1)],
  );

  const fact = await pool.query<{ id: string }>(
    `SELECT ef.id FROM evidence_fact ef JOIN patient p ON p.id = ef.patient_id
      WHERE p.demo_code = 'DEMO-003' AND ef.fact_type = 'appointment.recorded' LIMIT 1`,
  );

  cached = {
    org1,
    org2,
    clinicians,
    patients: {
      demo1: find('DEMO-001', org1),
      demo2: find('DEMO-002', org1),
      demo3: find('DEMO-003', org1),
      otherTenant: find('DEMO-001', org2),
    },
    readyFactId: fact.rows[0]!.id,
    sampleDocumentId: sample.rows[0]!.document_id,
    sampleSpanId: sample.rows[0]!.id,
    sampleSpanText: sample.rows[0]!.text,
  };
  return cached;
}

/** A raw app-role connection with no tenant context. */
export async function appClientNoTenant(): Promise<Client> {
  const c = new Client({ connectionString: env.databaseUrl });
  await c.connect();
  return c;
}

/** A raw app-role connection with a tenant context applied. */
export async function appClientForOrg(orgId: string, userId: string | null, role: string | null): Promise<Client> {
  const c = await appClientNoTenant();
  await c.query('SELECT set_config($1,$2,false)', ['app.org_id', orgId]);
  await c.query('SELECT set_config($1,$2,false)', ['app.user_id', userId ?? '']);
  await c.query('SELECT set_config($1,$2,false)', ['app.role', role ?? '']);
  return c;
}

export async function withSuperuser<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getMigratorPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
