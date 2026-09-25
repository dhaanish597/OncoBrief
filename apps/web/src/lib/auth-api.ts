import 'server-only';
import {
  authLookupUser,
  env,
  mapGroupsToRole,
  verifyCognitoJwt,
  type TenantContext,
} from '@oncobrief/db';
import type { Role } from '@oncobrief/domain';
import { getSession, tenantCtx } from './session';

/**
 * API authentication and authorization (Phase 17).
 *
 * Two modes, selected by `AUTH_MODE`:
 *   session  — the opaque server-side session cookie (default, unchanged).
 *   cognito  — a Cognito JWT in `Authorization: Bearer`, verified against the
 *              user pool JWKS and then cross-checked against the database
 *              membership, so claims alone never grant tenant access.
 *
 * Role and `org_id` are resolved server-side here; the frontend is never
 * trusted for either.
 */

export interface ApiCaller {
  ctx: TenantContext;
  role: Role;
  userId: string;
  orgId: string;
  email: string | null;
  source: 'session' | 'cognito';
}

export async function resolveApiCaller(request: Request): Promise<ApiCaller | null> {
  if (env.authMode === 'cognito') {
    const header = request.headers.get('authorization');
    if (!header || !header.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    try {
      const claims = await verifyCognitoJwt(token, env.cognito);
      const role = mapGroupsToRole(claims.groups);
      if (!role || !claims.orgId || !claims.email) return null;
      const rows = await authLookupUser(claims.email);
      const match = rows.find(
        (r) => r.org_id === claims.orgId && r.role === role && r.is_active,
      );
      if (!match) return null;
      return {
        ctx: { orgId: match.org_id, userId: match.user_id, role },
        role,
        userId: match.user_id,
        orgId: match.org_id,
        email: match.email,
        source: 'cognito',
      };
    } catch {
      return null;
    }
  }

  const session = await getSession();
  if (!session) return null;
  return {
    ctx: tenantCtx(session),
    role: session.role,
    userId: session.userId,
    orgId: session.orgId,
    email: null,
    source: 'session',
  };
}
