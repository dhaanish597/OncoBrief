import { NextResponse } from 'next/server';
import {
  validatePatientPortalSessionToken,
  type ValidatedPatientPortalSession,
} from '@oncobrief/db';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-actor-role, x-organization-slug',
  'Access-Control-Expose-Headers': 'Retry-After',
};

export const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  ...CORS_HEADERS,
};

// In-memory sliding rate limiter: max 5 login attempts per 15 minutes per IP/identifier
const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimitsForTest(): void {
  rateLimits.clear();
}

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) {
    return false;
  }
  entry.count++;
  return true;
}

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') ?? request.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1]!.trim() : null;
}

export type PatientSessionAuthResult =
  | { ok: true; session: ValidatedPatientPortalSession }
  | { ok: false; response: NextResponse };

/**
 * Authenticates a request against the patient portal session store.
 * Rejects missing, malformed, expired, or revoked bearer tokens (SEC-NEG-01..05).
 * If requiredScope is specified, verifies the session possesses that scope.
 */
export async function requirePatientPortalSession(
  request: Request,
  requiredScope?: string,
): Promise<PatientSessionAuthResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'unauthorized', message: 'Missing or malformed Authorization header' } },
        { status: 401, headers: NO_CACHE_HEADERS },
      ),
    };
  }

  const session = await validatePatientPortalSessionToken(token);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'unauthorized', message: 'Session token invalid, expired, or revoked' } },
        { status: 401, headers: NO_CACHE_HEADERS },
      ),
    };
  }

  if (requiredScope && !session.grantedScopes.includes(requiredScope)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: 'forbidden_scope',
            message: `Session lacks required permission scope: ${requiredScope}`,
          },
        },
        { status: 403, headers: NO_CACHE_HEADERS },
      ),
    };
  }

  return { ok: true, session };
}
