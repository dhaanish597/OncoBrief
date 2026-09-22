import { createHash, randomBytes } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { Role } from '@oncobrief/domain';
import { authLookupSession, authLookupUser, type Querier } from '../client.js';
import { appendAuditEvent, type AuditRequestMeta } from './audit.js';

/**
 * Session authentication (architecture §13.1).
 *
 * Argon2id at the OWASP baseline, opaque 256-bit session tokens stored as a
 * SHA-256 hash, server-side rows so revocation is instant. Rejected: JWTs,
 * because a healthcare system that cannot immediately cut off a session has a
 * real problem.
 */

const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password);
  } catch {
    return false;
  }
}

export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;

export function newSessionToken(): { token: string; tokenHash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: sha256(token) };
}

export function sha256(input: string): Buffer {
  return createHash('sha256').update(input).digest();
}

export interface SessionContext {
  sessionId: string;
  orgId: string;
  userId: string;
  role: Role;
  expiresAt: Date;
}

export interface LoginResult {
  token: string;
  context: SessionContext;
  displayName: string;
  orgName: string;
  orgSlug: string;
}

/**
 * Login. Returns null on any failure without revealing which part failed.
 * The lookup uses a SECURITY DEFINER function because it happens before
 * app.org_id is known.
 */
export async function login(
  q: Querier,
  email: string,
  password: string,
  request: AuditRequestMeta = {},
): Promise<LoginResult | null> {
  const candidates = await authLookupUser(email);
  const first = candidates[0];

  if (!first || !first.is_active) {
    // No org context is available for a failed lookup, so the denial is
    // recorded without one (best effort) rather than skipped.
    return null;
  }

  const ok = await verifyPassword(first.password_hash, password);
  if (!ok) return null;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  const { token, tokenHash } = newSessionToken();

  await q.query(
    `INSERT INTO session (org_id, user_id, token_hash, role, expires_at, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [first.org_id, first.user_id, tokenHash, first.role, expiresAt, now],
  );

  await appendAuditEvent(q, {
    orgId: first.org_id,
    actor: { userId: first.user_id, role: first.role },
    action: 'auth.login',
    entityKind: 'session',
    entityId: null,
    outcome: 'success',
    request,
  });

  return {
    token,
    context: {
      sessionId: '',
      orgId: first.org_id,
      userId: first.user_id,
      role: first.role,
      expiresAt,
    },
    displayName: first.display_name,
    orgName: first.org_name,
    orgSlug: first.org_slug,
  };
}

export interface ValidatedSession extends SessionContext {
  tokenHash: Buffer;
}

/** Validates a cookie token and enforces absolute + idle expiry. */
export async function validateSessionToken(token: string): Promise<ValidatedSession | null> {
  const tokenHash = sha256(token);
  const rows = await authLookupSession(tokenHash);
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;

  const now = Date.now();
  if (row.expires_at.getTime() < now) return null;
  if (now - row.last_seen_at.getTime() > SESSION_IDLE_MS) return null;

  return {
    sessionId: row.session_id,
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role,
    expiresAt: row.expires_at,
    tokenHash,
  };
}

export async function touchSession(q: Querier, tokenHash: Buffer): Promise<void> {
  await q.query('UPDATE session SET last_seen_at = now() WHERE token_hash = $1', [tokenHash]);
}

export async function logout(q: Querier, session: ValidatedSession, request: AuditRequestMeta = {}): Promise<void> {
  await q.query('UPDATE session SET revoked_at = now() WHERE id = $1', [session.sessionId]);
  await appendAuditEvent(q, {
    orgId: session.orgId,
    actor: { userId: session.userId, role: session.role },
    action: 'auth.logout',
    entityKind: 'session',
    entityId: session.sessionId,
    outcome: 'success',
    request,
  });
}

export async function revokeAllSessionsForUser(q: Querier, userId: string): Promise<void> {
  await q.query('UPDATE session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
    userId,
  ]);
}
