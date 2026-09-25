import { createHash, createHmac } from 'node:crypto';

/**
 * Minimal AWS Signature Version 4 implementation (header and query-string
 * forms), built on `node:crypto` only.
 *
 * Why not the AWS SDK: this package has no runtime dependencies, and the
 * adapters must run offline in tests. Implementing SigV4 in-repo keeps the
 * adapters unit-testable against fixed vectors with no network and no
 * credential chain. See ADR 0015.
 */

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface AwsEndpoint {
  /** e.g. `https://s3.ap-south-1.amazonaws.com` or a LocalStack URL. */
  url: string;
  region: string;
  service: string;
}

export interface SignedHeaders {
  [name: string]: string;
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function amzDate(now: Date): { full: string; short: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { full: iso, short: iso.slice(0, 8) };
}

/** RFC 3986 encoding: unreserved A-Z a-z 0-9 - _ . ~ are untouched. */
export function awsUriEncode(input: string, encodeSlash: boolean): string {
  let out = '';
  for (const ch of input) {
    if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch;
    else if (ch === '/' && !encodeSlash) out += ch;
    else out += `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

function canonicalUri(path: string): string {
  if (path === '' || path === '/') return '/';
  return path
    .split('/')
    .map((segment) => awsUriEncode(segment, true))
    .join('/');
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${awsUriEncode(k, true)}=${awsUriEncode(params[k] ?? '', true)}`)
    .join('&');
}

function deriveSigningKey(secret: string, short: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, short);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export interface SignRequestInput extends AwsEndpoint {
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: SignedHeaders;
  body?: string | Buffer;
  credentials: AwsCredentials;
  now: Date;
}

/**
 * Sign a request with the Authorization header. Returns the full set of
 * headers to send (including `host`, `x-amz-date` and `authorization`).
 */
export function signRequest(input: SignRequestInput): SignedHeaders {
  const { full, short } = amzDate(input.now);
  const parsed = new URL(input.url);
  const headers: SignedHeaders = { host: parsed.host, ...lowercaseHeaders(input.headers ?? {}) };
  headers['x-amz-date'] = full;
  if (input.credentials.sessionToken) headers['x-amz-security-token'] = input.credentials.sessionToken;

  const body = input.body ?? '';
  const payloadHash = sha256Hex(body);
  headers['x-amz-content-sha256'] = payloadHash;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]!.trim()}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');

  const request = [
    input.method.toUpperCase(),
    canonicalUri(input.path),
    canonicalQuery(input.query ?? {}),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${short}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', full, scope, sha256Hex(request)].join('\n');
  const signingKey = deriveSigningKey(input.credentials.secretAccessKey, short, input.region, input.service);
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  headers['authorization'] =
    `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

export interface PresignInput extends AwsEndpoint {
  method: 'GET' | 'PUT';
  path: string;
  query?: Record<string, string>;
  expiresSeconds: number;
  credentials: AwsCredentials;
  now: Date;
  /** For PUT, the content type the client must send. */
  contentType?: string;
}

export interface PresignResult {
  url: string;
  requiredHeaders: Record<string, string>;
  expiresAt: Date;
}

/**
 * Presign with query-string authentication (`X-Amz-Signature`). The payload is
 * `UNSIGNED-PAYLOAD`, which is valid for S3 with TLS. `expiresSeconds` is
 * clamped by the caller; S3 allows at most 7 days.
 */
export function presign(input: PresignInput): PresignResult {
  const { full, short } = amzDate(input.now);
  const parsed = new URL(input.url);
  const scope = `${short}/${input.region}/${input.service}/aws4_request`;

  const query: Record<string, string> = {
    ...(input.query ?? {}),
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.credentials.accessKeyId}/${scope}`,
    'X-Amz-Date': full,
    'X-Amz-Expires': String(input.expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  if (input.credentials.sessionToken) query['X-Amz-Security-Token'] = input.credentials.sessionToken;

  const canonicalHeaders = `host:${parsed.host}\n`;
  const request = [
    input.method,
    canonicalUri(input.path),
    canonicalQuery(query),
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', full, scope, sha256Hex(request)].join('\n');
  const signingKey = deriveSigningKey(input.credentials.secretAccessKey, short, input.region, input.service);
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  query['X-Amz-Signature'] = signature;

  const url = `${parsed.origin}${canonicalUri(input.path)}?${canonicalQuery(query)}`;
  const requiredHeaders: Record<string, string> = input.contentType
    ? { 'content-type': input.contentType }
    : {};
  return {
    url,
    requiredHeaders,
    expiresAt: new Date(input.now.getTime() + input.expiresSeconds * 1000),
  };
}

function lowercaseHeaders(headers: SignedHeaders): SignedHeaders {
  const out: SignedHeaders = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}
