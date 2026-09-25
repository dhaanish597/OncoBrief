import { createPublicKey, createVerify } from 'node:crypto';
import type { Role } from '@oncobrief/domain';
import { ROLES } from '@oncobrief/domain';

/**
 * Cognito JWT validation (Phase 17).
 *
 * Verifies an RS256 access/id token against the user pool JWKS, then checks
 * issuer, audience and expiry. Role and tenant are taken from signed claims and
 * are *re-checked against the database membership* by the caller, so a token
 * from a misconfigured pool cannot grant access to an organization the user is
 * not a member of.
 *
 * Implemented with `node:crypto` only (no SDK), consistent with the adapters.
 * Tests inject a locally generated JWKS.
 */

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  issuer?: string;
}

export interface CognitoClaims {
  sub: string;
  email: string | null;
  orgId: string | null;
  groups: string[];
  tokenUse: 'id' | 'access' | null;
  iss: string;
  exp: number;
}

export type CognitoErrorCode =
  | 'malformed_token'
  | 'unsupported_algorithm'
  | 'unknown_key'
  | 'bad_signature'
  | 'expired'
  | 'bad_issuer'
  | 'bad_audience';

export class CognitoAuthError extends Error {
  constructor(
    readonly code: CognitoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CognitoAuthError';
  }
}

interface Jwk {
  kid?: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

interface Jwks {
  keys: Jwk[];
}

const jwksCache = new Map<string, { jwks: Jwks; fetchedAt: number }>();
const JWKS_TTL_MS = 5 * 60 * 1000;

export function issuerFor(config: CognitoConfig): string {
  return config.issuer ?? `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

export interface VerifyDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Test seam: bypass the network and supply the key set directly. */
  jwks?: Jwks;
}

export async function verifyCognitoJwt(
  token: string,
  config: CognitoConfig,
  deps: VerifyDeps = {},
): Promise<CognitoClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new CognitoAuthError('malformed_token', 'token must have three segments');
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') {
    throw new CognitoAuthError('unsupported_algorithm', `unsupported alg: ${header.alg ?? 'none'}`);
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as Record<string, unknown>;
  const jwks = deps.jwks ?? (await fetchJwks(issuerFor(config), deps));
  const jwk = jwks.keys.find((k) => k.kid === header.kid) ?? jwks.keys[0];
  if (!jwk) throw new CognitoAuthError('unknown_key', `no JWKS key for kid ${header.kid ?? 'unknown'}`);

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const publicKey = createPublicKey({ key: jwk as unknown as Record<string, unknown>, format: 'jwk' });
  const signature = base64UrlDecode(signatureB64);
  if (!verifier.verify(publicKey, signature)) {
    throw new CognitoAuthError('bad_signature', 'signature verification failed');
  }

  const now = deps.now ? deps.now().getTime() : Date.now();
  const exp = Number(payload['exp'] ?? 0);
  if (!Number.isFinite(exp) || exp * 1000 <= now) {
    throw new CognitoAuthError('expired', 'token is expired');
  }

  const issuer = issuerFor(config);
  if (payload['iss'] !== issuer) {
    throw new CognitoAuthError('bad_issuer', `unexpected issuer: ${String(payload['iss'])}`);
  }

  const aud = payload['aud'];
  const clientId = payload['client_id'];
  if (config.clientId) {
    const matches = (typeof aud === 'string' && aud === config.clientId) ||
      (typeof clientId === 'string' && clientId === config.clientId);
    if (!matches) throw new CognitoAuthError('bad_audience', 'token audience does not match the client id');
  }

  const groups = Array.isArray(payload['cognito:groups'])
    ? (payload['cognito:groups'] as unknown[]).map(String)
    : [];

  return {
    sub: String(payload['sub'] ?? ''),
    email: typeof payload['email'] === 'string' ? payload['email'] : null,
    orgId: typeof payload['custom:org_id'] === 'string' ? payload['custom:org_id'] : null,
    groups,
    tokenUse: payload['token_use'] === 'id' || payload['token_use'] === 'access' ? payload['token_use'] : null,
    iss: issuer,
    exp,
  };
}

/** Map Cognito groups to an OncoBrief role. Group names may be bare or prefixed. */
export function mapGroupsToRole(groups: readonly string[]): Role | null {
  for (const group of groups) {
    const normalized = group.replace(/^oncobrief[:-]/i, '').toLowerCase();
    if ((ROLES as readonly string[]).includes(normalized)) return normalized as Role;
  }
  return null;
}

async function fetchJwks(issuer: string, deps: VerifyDeps): Promise<Jwks> {
  const cached = jwksCache.get(issuer);
  const now = deps.now ? deps.now().getTime() : Date.now();
  if (cached && now - cached.fetchedAt < JWKS_TTL_MS) return cached.jwks;

  const fetchImpl = deps.fetchImpl ?? fetch;
  const res = await fetchImpl(`${issuer}/.well-known/jwks.json`);
  if (!res.ok) throw new CognitoAuthError('unknown_key', `jwks fetch failed: ${res.status}`);
  const jwks = (await res.json()) as Jwks;
  jwksCache.set(issuer, { jwks, fetchedAt: now });
  return jwks;
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}
