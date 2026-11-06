import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupFixtures, type Fixtures } from '@oncobrief/db/test-helpers';
import { POST, GET, DELETE } from './route';
import { resetRateLimitsForTest } from '@/lib/patient-session';

let fx: Fixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 120_000);

beforeEach(() => {
  resetRateLimitsForTest();
});

describe('MOB-007: Patient Portal Session API (/api/v1/patient-portal/session)', () => {
  const reqPost = (body: unknown) =>
    new Request('http://localhost/api/v1/patient-portal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
      body: JSON.stringify(body),
    });

  const reqGet = (token?: string) =>
    new Request('http://localhost/api/v1/patient-portal/session', {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  const reqDelete = (token?: string) =>
    new Request('http://localhost/api/v1/patient-portal/session', {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  it('successful patient authentication issues bearer session token (REQ-MOB-010)', async () => {
    const res = await POST(
      reqPost({
        hospitalSlug: 'rci',
        patientExternalId: 'DEMO-001',
        otpCode: '246810',
        actorRole: 'patient',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sessionToken).toBeTruthy();
    expect(body.patientId).toBe(fx.patients.demo1);
    expect(body.actorRole).toBe('patient');
    expect(body.grantedScopes).toContain('appointments');
    expect(body.grantedScopes).toContain('documents');
  });

  it('rejects invalid OTP with 401 (SEC-NEG-01)', async () => {
    const res = await POST(
      reqPost({
        hospitalSlug: 'rci',
        patientExternalId: 'DEMO-001',
        otpCode: '999999',
        actorRole: 'patient',
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_credentials');
  });

  it('rejects fixed test OTP unconditionally in production environment (SEC-NEG-21)', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalAllow = process.env.ALLOW_SYNTHETIC_TEST_OTP;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.ALLOW_SYNTHETIC_TEST_OTP;

      const res = await POST(
        reqPost({
          hospitalSlug: 'rci',
          patientExternalId: 'DEMO-001',
          otpCode: '246810',
          actorRole: 'patient',
        }),
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_credentials');
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
      if (originalAllow) process.env.ALLOW_SYNTHETIC_TEST_OTP = originalAllow;
    }
  });

  it('rejects fixed test OTP in production even when ALLOW_SYNTHETIC_TEST_OTP=true (SEC-NEG-21-OVERRIDE-REJECTED)', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalAllow = process.env.ALLOW_SYNTHETIC_TEST_OTP;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.ALLOW_SYNTHETIC_TEST_OTP = 'true';

      const res = await POST(
        reqPost({
          hospitalSlug: 'rci',
          patientExternalId: 'DEMO-001',
          otpCode: '246810',
          actorRole: 'patient',
        }),
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('invalid_credentials');
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
      if (originalAllow !== undefined) {
        process.env.ALLOW_SYNTHETIC_TEST_OTP = originalAllow;
      } else {
        delete process.env.ALLOW_SYNTHETIC_TEST_OTP;
      }
    }
  });

  it('rejects non-existent hospital with 404', async () => {
    const res = await POST(
      reqPost({
        hospitalSlug: 'non-existent-hospital',
        patientExternalId: 'DEMO-001',
        otpCode: '246810',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('rejects non-existent patient with 404', async () => {
    const res = await POST(
      reqPost({
        hospitalSlug: 'rci',
        patientExternalId: 'NON-EXISTENT-PATIENT',
        otpCode: '246810',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('validates active session via GET and enforces immediate invalidation on DELETE (SEC-NEG-02)', async () => {
    // 1. Create session
    const createRes = await POST(
      reqPost({
        hospitalSlug: 'rci',
        patientExternalId: 'DEMO-001',
        otpCode: '246810',
      }),
    );
    const { sessionToken } = await createRes.json();

    // 2. Validate via GET
    const getRes = await GET(reqGet(sessionToken));
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.session.patientId).toBe(fx.patients.demo1);

    // 3. Delete session (Logout)
    const delRes = await DELETE(reqDelete(sessionToken));
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.revoked).toBe(true);

    // 4. Validate GET again: must immediately return 401
    const rechecked = await GET(reqGet(sessionToken));
    expect(rechecked.status).toBe(401);
  });

  it('rejects missing or malformed Authorization header with 401 (SEC-NEG-03)', async () => {
    expect((await GET(reqGet())).status).toBe(401);
    expect((await GET(new Request('http://localhost/session', { headers: { Authorization: 'Basic 12345' } }))).status).toBe(401);
  });

  it('rejects unconsented caregiver login with 403 (SEC-NEG-04)', async () => {
    const res = await POST(
      reqPost({
        hospitalSlug: 'rci',
        patientExternalId: 'DEMO-001',
        otpCode: '246810',
        actorRole: 'caregiver',
        caregiverPhone: '+919999999999', // Unknown / unconsented phone
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('caregiver_not_authorized');
  });

  it('enforces brute-force rate limit throttling after 5 attempts', async () => {
    const throttleIp = 'test-throttle:10.0.0.1';
    for (let i = 0; i < 5; i++) {
      await POST(
        new Request('http://localhost/api/v1/patient-portal/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': throttleIp },
          body: JSON.stringify({
            hospitalSlug: 'rci',
            patientExternalId: 'DEMO-001',
            otpCode: '000000',
          }),
        }),
      );
    }
    const throttled = await POST(
      new Request('http://localhost/api/v1/patient-portal/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': throttleIp },
        body: JSON.stringify({
          hospitalSlug: 'rci',
          patientExternalId: 'DEMO-001',
          otpCode: '000000',
        }),
      }),
    );
    expect(throttled.status).toBe(429);
    const body = await throttled.json();
    expect(body.error.code).toBe('rate_limit_exceeded');
  });
});
