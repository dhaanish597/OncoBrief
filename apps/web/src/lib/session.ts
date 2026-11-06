import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { can, type Permission, type Role } from '@oncobrief/domain';
import {
  validateSessionToken,
  withTenant,
  touchSession,
  type Querier,
  type TenantContext,
  type ValidatedSession,
} from '@oncobrief/db';

/**
 * Session plumbing. The cookie holds an opaque token; the server holds a
 * SHA-256 hash of it in a `session` row, so a stolen database yields no usable
 * token and revocation is immediate (architecture §13.1).
 */

export const SESSION_COOKIE = 'ob_session';
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(ABSOLUTE_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<ValidatedSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

export const getSessionFromCookies = getSession;

export async function requireSession(): Promise<ValidatedSession> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export function assertRolePermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`forbidden: Role '${role}' lacks required permission '${permission}'`);
  }
}

/**
 * Defense-in-depth tenant ownership check (TASK-003, ADR-003).
 * Ensures a target patient ID belongs to the caller's active organization
 * before executing any mutation inside a Server Action or Route Handler.
 */
export async function assertPatientBelongsToOrg(
  q: Querier,
  orgId: string,
  patientId: string,
): Promise<void> {
  if (!patientId || !orgId) {
    throw new Error('patient_not_found_or_unauthorized');
  }
  const res = await q.query<{ id: string }>(
    'SELECT id FROM patient WHERE org_id = $1 AND id = $2 LIMIT 1',
    [orgId, patientId],
  );
  if (!res.rows[0]) {
    throw new Error('patient_not_found_or_unauthorized');
  }
}

export function tenantCtx(session: ValidatedSession): TenantContext {
  return { orgId: session.orgId, userId: session.userId, role: session.role };
}

/** Run a tenant-scoped transaction as the logged-in user. */
export async function withSession<T>(
  fn: (q: Querier, session: ValidatedSession) => Promise<T>,
): Promise<T> {
  const session = await requireSession();
  return withTenant(tenantCtx(session), (q) => fn(q, session));
}

/** Sliding idle renewal, best-effort. */
export async function touchCurrentSession(session: ValidatedSession): Promise<void> {
  if (Date.now() - session.expiresAt.getTime() + ABSOLUTE_MS > 0) {
    try {
      await withTenant(tenantCtx(session), (q) => touchSession(q, session.tokenHash));
    } catch {
      /* non-fatal */
    }
  }
}
