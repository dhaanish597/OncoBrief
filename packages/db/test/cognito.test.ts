import { generateKeyPairSync, createSign, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CognitoAuthError,
  issuerFor,
  mapGroupsToRole,
  verifyCognitoJwt,
  type CognitoConfig,
} from '../src/services/cognito';

/**
 * Phase 17 — Cognito JWT validation. A locally generated RSA keypair and a
 * hand-built JWKS exercise the verifier fully offline.
 */

const config: CognitoConfig = {
  region: 'ap-south-1',
  userPoolId: 'ap-south-1_test',
  clientId: 'client-abc',
};
const issuer = issuerFor(config);

function makeKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string };
  return {
    privateKey,
    jwks: { keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: 'key-1', alg: 'RS256' }] },
  };
}

function sign(privateKey: KeyObject, payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: 'key-1' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createSign('RSA-SHA256').update(`${header}.${body}`).sign(privateKey);
  return `${header}.${body}.${base64url(signature)}`;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'user-1',
    email: 'dr.rao@rci.demo',
    iss: issuer,
    aud: config.clientId,
    token_use: 'id',
    exp: Math.floor(Date.now() / 1000) + 600,
    'cognito:groups': ['oncobrief-clinician'],
    'custom:org_id': 'org-1',
    ...overrides,
  };
}

const now = () => new Date();

describe('verifyCognitoJwt', () => {
  it('accepts a valid token and extracts org, email and groups', async () => {
    const { privateKey, jwks } = makeKeys();
    const token = sign(privateKey, claims());
    const result = await verifyCognitoJwt(token, config, { jwks, now });
    expect(result.sub).toBe('user-1');
    expect(result.email).toBe('dr.rao@rci.demo');
    expect(result.orgId).toBe('org-1');
    expect(result.groups).toEqual(['oncobrief-clinician']);
  });

  it('rejects a tampered payload', async () => {
    const { privateKey, jwks } = makeKeys();
    const token = sign(privateKey, claims());
    const [h, , s] = token.split('.');
    const forged = `${h}.${base64url(JSON.stringify(claims({ 'custom:org_id': 'org-evil' })))}.${s}`;
    await expect(verifyCognitoJwt(forged, config, { jwks, now })).rejects.toBeInstanceOf(CognitoAuthError);
  });

  it('rejects an expired token', async () => {
    const { privateKey, jwks } = makeKeys();
    const token = sign(privateKey, claims({ exp: Math.floor(Date.now() / 1000) - 10 }));
    await expect(verifyCognitoJwt(token, config, { jwks, now })).rejects.toMatchObject({ code: 'expired' });
  });

  it('rejects a wrong issuer', async () => {
    const { privateKey, jwks } = makeKeys();
    const token = sign(privateKey, claims({ iss: 'https://evil.example.com' }));
    await expect(verifyCognitoJwt(token, config, { jwks, now })).rejects.toMatchObject({ code: 'bad_issuer' });
  });

  it('rejects a wrong audience', async () => {
    const { privateKey, jwks } = makeKeys();
    const token = sign(privateKey, claims({ aud: 'other-client' }));
    await expect(verifyCognitoJwt(token, config, { jwks, now })).rejects.toMatchObject({ code: 'bad_audience' });
  });

  it('rejects a non-RS256 algorithm header', async () => {
    const { jwks } = makeKeys();
    const header = base64url(JSON.stringify({ alg: 'none', kid: 'key-1' }));
    const body = base64url(JSON.stringify(claims()));
    await expect(
      verifyCognitoJwt(`${header}.${body}.x`, config, { jwks, now }),
    ).rejects.toMatchObject({ code: 'unsupported_algorithm' });
  });
});

describe('mapGroupsToRole', () => {
  it('maps prefixed and bare group names', () => {
    expect(mapGroupsToRole(['oncobrief-records_officer'])).toBe('records_officer');
    expect(mapGroupsToRole(['clinician'])).toBe('clinician');
  });

  it('returns null for an unknown group', () => {
    expect(mapGroupsToRole(['superuser'])).toBeNull();
    expect(mapGroupsToRole([])).toBeNull();
  });
});
