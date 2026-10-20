import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { Role } from '@oncobrief/domain';
import { env, repoRootPath } from './env';

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

export interface SslOptions {
  rejectUnauthorized: boolean;
  ca: string;
  servername?: string;
}

export interface ResolvedPoolOptions {
  connectionString: string;
  ssl?: SslOptions;
}

function getBundledRdsCaPath(): string | null {
  const candidate1 = resolve(repoRootPath, 'packages/db/certs/rds-global-bundle.pem');
  if (existsSync(candidate1)) return candidate1;
  const candidate2 = resolve(process.cwd(), 'packages/db/certs/rds-global-bundle.pem');
  if (existsSync(candidate2)) return candidate2;
  return null;
}

export function resolveTrustedCa(
  caOverride?: string | null,
  caPathOverride?: string,
  allowBundledFallback = true,
): string | null {
  if (caOverride !== undefined) {
    if (caOverride === null || caOverride.trim().length === 0) return null;
    const val = caOverride.trim();
    if (val.includes('-----BEGIN CERTIFICATE-----')) return val;
    try {
      const decoded = Buffer.from(val, 'base64').toString('utf8');
      if (decoded.includes('-----BEGIN CERTIFICATE-----')) return decoded;
    } catch {
      /* not base64 */
    }
    return val;
  }

  const envCa = process.env.DATABASE_SSL_CA;
  if (envCa && envCa.trim().length > 0) {
    const val = envCa.trim();
    if (val.includes('-----BEGIN CERTIFICATE-----')) return val;
    try {
      const decoded = Buffer.from(val, 'base64').toString('utf8');
      if (decoded.includes('-----BEGIN CERTIFICATE-----')) return decoded;
    } catch {
      /* not base64 */
    }
    return val;
  }

  if (caPathOverride) {
    if (existsSync(caPathOverride)) {
      return readFileSync(caPathOverride, 'utf8');
    }
    return null; // Explicit path was provided but does not exist: fail closed!
  }

  const envCaPath = process.env.DATABASE_SSL_CA_PATH;
  if (envCaPath) {
    if (existsSync(envCaPath)) {
      return readFileSync(envCaPath, 'utf8');
    }
    return null; // Explicit env path was provided but does not exist: fail closed!
  }

  if (allowBundledFallback) {
    const bundledPath = getBundledRdsCaPath();
    if (bundledPath) {
      return readFileSync(bundledPath, 'utf8');
    }
  }

  return null;
}

/**
 * Build pool options from a connection string with verified TLS.
 *
 * For remote/production PostgreSQL instances (e.g. AWS RDS), SSL certificate
 * verification is enforced with `rejectUnauthorized: true`, the trusted CA
 * bundle, and hostname matching (`verify-full` equivalent). Connections fail
 * closed if SSL is requested but no CA is available. Local development without
 * `sslmode` connects via plain TCP.
 */
export function resolvePoolOptions(
  connectionString: string,
  overrides?: {
    ca?: string | null;
    caPath?: string;
    requireSsl?: boolean;
    allowBundledFallback?: boolean;
  },
): ResolvedPoolOptions {
  try {
    const parsed = new URL(connectionString);
    const sslmode = parsed.searchParams.get('sslmode');
    const sslParam = parsed.searchParams.get('ssl');
    const isExplicitDisable = sslmode === 'disable' || sslParam === 'false' || sslParam === '0';

    if (isExplicitDisable) {
      parsed.searchParams.delete('sslmode');
      parsed.searchParams.delete('ssl');
      parsed.searchParams.delete('uselibpqcompat');
      return { connectionString: parsed.toString() };
    }

    const sslRequested =
      Boolean(sslmode && sslmode !== 'disable') ||
      sslParam === 'true' ||
      sslParam === '1' ||
      overrides?.requireSsl === true ||
      process.env.DATABASE_SSL === 'true';

    if (!sslRequested) {
      return { connectionString };
    }

    const ca = resolveTrustedCa(overrides?.ca, overrides?.caPath, overrides?.allowBundledFallback);
    if (!ca) {
      throw new Error(
        `Database TLS verification failed: SSL is required (${sslmode ?? 'require'}) but no trusted CA certificate was provided. Set DATABASE_SSL_CA or DATABASE_SSL_CA_PATH, or ensure the RDS CA bundle is installed.`,
      );
    }

    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    parsed.searchParams.delete('uselibpqcompat');

    const ssl: SslOptions = {
      rejectUnauthorized: true,
      ca,
      ...(parsed.hostname ? { servername: parsed.hostname } : {}),
    };

    return {
      connectionString: parsed.toString(),
      ssl,
    };
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('Invalid URL')) {
      if (overrides?.requireSsl || process.env.DATABASE_SSL === 'true') {
        const ca = resolveTrustedCa(overrides?.ca, overrides?.caPath);
        if (!ca) {
          throw new Error(
            'Database TLS verification failed: SSL is required but no trusted CA certificate was provided.',
          );
        }
        return {
          connectionString,
          ssl: { rejectUnauthorized: true, ca },
        };
      }
      return { connectionString };
    }
    throw err;
  }
}

export function getAppPool(): Pool {
  if (!appPool) {
    appPool = new Pool({ ...resolvePoolOptions(env.databaseUrl), max: 10 });
  }
  return appPool;
}

export function getMigratorPool(): Pool {
  if (!migratorPool) {
    migratorPool = new Pool({ ...resolvePoolOptions(env.migratorUrl), max: 3 });
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
