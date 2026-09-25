import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { Role } from '@oncobrief/domain';
import { env } from './env';

/**
 * Tenant-scoped database access.
 *
 * Every request opens a transaction and issues
 * `SELECT set_config('app.org_id', $1, true)`. The `true` makes it
 * transaction-local, so a pooled connection cannot leak tenant context to the
 * next request. If the call is forgotten the RLS policy evaluates
 * `org_id = NULL`, which is never true, and the query returns zero rows.
 */

let appPool: Pool | null = null;
let migratorPool: Pool | null = null;

/**
 * Build pool options from a connection string.
 *
 * pg 8 treats `sslmode=require` as `verify-full`, which fails against an RDS
 * instance whose CA is not in Node's trust store ("self-signed certificate in
 * certificate chain"). For a remote host we therefore enable TLS with
 * `rejectUnauthorized: false` — the connection is still encrypted, but the
 * server certificate is not verified. Bundling the RDS global CA bundle is the
 * production hardening step (docs/security.md). Local development has no
 * `sslmode` and is unaffected.
 */
function poolOptions(connectionString: string): { connectionString: string; ssl?: { rejectUnauthorized: boolean } } {
  try {
    const parsed = new URL(connectionString);
    const sslmode = parsed.searchParams.get('sslmode');
    if (sslmode && sslmode !== 'disable') {
      parsed.searchParams.delete('sslmode');
      parsed.searchParams.delete('uselibpqcompat');
      return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } };
    }
  } catch {
    /* not a URL; fall through to the raw string */
  }
  return { connectionString };
}

export function getAppPool(): Pool {
  if (!appPool) {
    appPool = new Pool({ ...poolOptions(env.databaseUrl), max: 10 });
  }
  return appPool;
}

export function getMigratorPool(): Pool {
  if (!migratorPool) {
    migratorPool = new Pool({ ...poolOptions(env.migratorUrl), max: 3 });
  }
  return migratorPool;
}

export interface TenantContext {
  orgId: string;
  userId: string | null;
  role: Role | null;
}

export type Querier = {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
};

export async function withTenant<T>(
  ctx: TenantContext,
  fn: (q: Querier) => Promise<T>,
): Promise<T> {
  const client = await getAppPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.org_id', ctx.orgId]);
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', ctx.userId ?? '']);
    await client.query('SELECT set_config($1, $2, true)', ['app.role', ctx.role ?? '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * A bare transaction on the app pool, for flows that must set the tenant
 * context partway through (login resolves the org before it can).
 */
export async function withTransaction<T>(fn: (q: Querier) => Promise<T>): Promise<T> {
  const client = await getAppPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * A tenant-scoped transaction whose commit can be controlled by the caller.
 * Used by flows that must validate after writing (e.g. the approval gate).
 */
export async function withTenantClient<T>(
  ctx: TenantContext,
  fn: (q: Querier, client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getAppPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.org_id', ctx.orgId]);
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', ctx.userId ?? '']);
    await client.query('SELECT set_config($1, $2, true)', ['app.role', ctx.role ?? '']);
    const result = await fn(client, client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export interface AuthUserRow {
  user_id: string;
  email: string;
  display_name: string;
  password_hash: string;
  is_active: boolean;
  org_id: string;
  org_slug: string;
  org_name: string;
  role: Role;
}

export interface AuthSessionRow {
  session_id: string;
  org_id: string;
  user_id: string;
  role: Role;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date;
}

/**
 * Auth bootstrap reads go through SECURITY DEFINER functions because they
 * happen before app.org_id is known. They are the only cross-cutting reads.
 */
export async function authLookupUser(email: string): Promise<AuthUserRow[]> {
  const res = await getAppPool().query<AuthUserRow>('SELECT * FROM auth_lookup_user($1)', [email]);
  return res.rows;
}

export async function authLookupSession(tokenHash: Buffer): Promise<AuthSessionRow[]> {
  const res = await getAppPool().query<AuthSessionRow>('SELECT * FROM auth_lookup_session($1)', [
    tokenHash,
  ]);
  return res.rows;
}

export async function closePools(): Promise<void> {
  await Promise.all([appPool?.end(), migratorPool?.end()]);
  appPool = null;
  migratorPool = null;
}
