import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js Edge Middleware — Defense-in-Depth Authentication & Header Sanitization (TASK-003, ADR-003).
 *
 * Security Guarantees:
 *  1. CVE-2025-29927 Mitigation: Any inbound request containing the internal
 *     `x-middleware-subrequest` header (case-insensitive) is immediately rejected
 *     with HTTP 403 Forbidden so external callers can never bypass middleware checks.
 *  2. Route Protection: All authenticated clinical/operational workspace pages
 *     and `/api/v1/**` endpoints require either a non-empty `ob_session` cookie
 *     or an `Authorization: Bearer <token>` header, except explicit public or
 *     signature-verified webhook endpoints.
 *  3. Security Headers: Attaches `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
 *     and `Referrer-Policy: same-origin` to every response.
 */

const PUBLIC_PAGE_PREFIXES = ['/login', '/activate'] as const;

const PUBLIC_API_PREFIXES = [
  '/api/v1/health',
  '/api/v1/abdm/',
  '/api/v3/',
  '/api/v1/continuity/webhook',
  '/api/v1/extension/capture',
  '/api/v1/patient-portal/session',
] as const;

export function isPublicPathname(pathname: string): boolean {
  if (pathname === '/') return true;
  if (PUBLIC_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return true;
  }
  return false;
}

export function hasSpoofedMiddlewareHeader(headers: Headers): boolean {
  for (const [key] of headers.entries()) {
    if (key.toLowerCase() === 'x-middleware-subrequest') {
      return true;
    }
  }
  return false;
}

function attachSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'same-origin');
  return res;
}

export function middleware(request: NextRequest): NextResponse {
  // 1. Block CVE-2025-29927 x-middleware-subrequest header spoofing unconditionally
  if (hasSpoofedMiddlewareHeader(request.headers)) {
    return attachSecurityHeaders(
      NextResponse.json(
        { error: { code: 'forbidden_middleware_header_spoof' } },
        { status: 403 },
      ),
    );
  }

  const { pathname } = request.nextUrl;

  // 2. Allow CORS preflight OPTIONS requests unconditionally
  if (request.method === 'OPTIONS') {
    return attachSecurityHeaders(NextResponse.next());
  }

  // 3. Allow public landing, login, activation, and gateway callback paths
  if (isPublicPathname(pathname)) {
    return attachSecurityHeaders(NextResponse.next());
  }

  // 3. Check for session cookie or Bearer token
  const sessionCookie = request.cookies.get('ob_session')?.value?.trim();
  const authHeader = request.headers.get('authorization')?.trim();
  const hasBearer = Boolean(authHeader && authHeader.toLowerCase().startsWith('bearer ') && authHeader.length > 7);

  if (!sessionCookie && !hasBearer) {
    if (pathname.startsWith('/api/')) {
      return attachSecurityHeaders(
        NextResponse.json(
          { error: { code: 'unauthorized' } },
          { status: 401 },
        ),
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return attachSecurityHeaders(NextResponse.redirect(loginUrl, 307));
  }

  return attachSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
};
