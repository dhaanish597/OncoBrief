import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, hasSpoofedMiddlewareHeader, isPublicPathname } from '../middleware';

describe('Next.js Defense-in-Depth Middleware (TASK-003, ADR-003)', () => {
  it('detects and blocks CVE-2025-29927 x-middleware-subrequest header spoofing with HTTP 403', () => {
    const req = new NextRequest('http://localhost:3000/workspace', {
      headers: {
        'x-middleware-subrequest': 'middleware:middleware:middleware',
        cookie: 'ob_session=valid_looking_token',
      },
    });
    expect(hasSpoofedMiddlewareHeader(req.headers)).toBe(true);
    const res = middleware(req);
    expect(res.status).toBe(403);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('redirects unauthenticated browser requests on protected pages to /login', () => {
    const req = new NextRequest('http://localhost:3000/patients/12345678-1234-1234-1234-1234567890ab/evidence');
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?next=%2Fpatients%2F12345678-1234-1234-1234-1234567890ab%2Fevidence');
  });

  it('returns 401 JSON for unauthenticated requests to protected /api/v1 endpoints', () => {
    const req = new NextRequest('http://localhost:3000/api/v1/assistant/chat', {
      method: 'POST',
    });
    const res = middleware(req);
    expect(res.status).toBe(401);
  });

  it('allows public paths (/, /login, /activate, /api/v1/health, /api/v1/abdm/*) without session cookies', () => {
    expect(isPublicPathname('/')).toBe(true);
    expect(isPublicPathname('/login')).toBe(true);
    expect(isPublicPathname('/activate')).toBe(true);
    expect(isPublicPathname('/api/v1/health')).toBe(true);
    expect(isPublicPathname('/api/v1/abdm/v0.5/consents/hiu/notify')).toBe(true);

    const req = new NextRequest('http://localhost:3000/');
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('allows authenticated requests with ob_session cookie or Bearer token', () => {
    const cookieReq = new NextRequest('http://localhost:3000/workspace', {
      headers: { cookie: 'ob_session=test_token_123' },
    });
    expect(middleware(cookieReq).status).toBe(200);

    const bearerReq = new NextRequest('http://localhost:3000/api/v1/patients/123', {
      headers: { authorization: 'Bearer test_jwt_or_session_token' },
    });
    expect(middleware(bearerReq).status).toBe(200);
  });

  it('PH05-REG-001: allows patient portal session and CORS preflight OPTIONS requests without session cookies', () => {
    expect(isPublicPathname('/api/v1/patient-portal/session')).toBe(true);

    const sessionReq = new NextRequest('http://localhost:3000/api/v1/patient-portal/session', {
      method: 'POST',
      body: JSON.stringify({ phone: '+919876543210' }),
    });
    expect(middleware(sessionReq).status).toBe(200);

    const optionsReq = new NextRequest('http://localhost:3000/api/v1/patient-portal/snapshot', {
      method: 'OPTIONS',
    });
    expect(middleware(optionsReq).status).toBe(200);
  });
});
