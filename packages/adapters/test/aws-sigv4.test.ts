import { describe, expect, it } from 'vitest';
import { awsUriEncode, presign, signRequest } from '../src/aws-sigv4';

const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
const now = new Date('2026-01-05T12:00:00Z');

describe('awsUriEncode', () => {
  it('leaves unreserved characters and encodes the rest', () => {
    expect(awsUriEncode('a b/c~', false)).toBe('a%20b/c~');
    expect(awsUriEncode('a b/c~', true)).toBe('a%20b%2Fc~');
  });
});

describe('signRequest', () => {
  const base = {
    url: 'https://s3.ap-south-1.amazonaws.com',
    path: '/bucket/key%20name.pdf',
    region: 'ap-south-1',
    service: 's3',
    credentials,
    now,
  };

  it('produces a well-formed Authorization header and payload hash', () => {
    const headers = signRequest({ ...base, method: 'PUT', body: 'hello' });
    expect(headers['authorization']).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260105\/ap-south-1\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
    );
    expect(headers['x-amz-content-sha256']).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(headers['x-amz-date']).toBe('20260105T120000Z');
  });

  it('is deterministic and changes when the body changes', () => {
    const a = signRequest({ ...base, method: 'PUT', body: 'a' });
    const b = signRequest({ ...base, method: 'PUT', body: 'a' });
    const c = signRequest({ ...base, method: 'PUT', body: 'b' });
    expect(a['authorization']).toBe(b['authorization']);
    expect(a['authorization']).not.toBe(c['authorization']);
  });
});

describe('presign', () => {
  const input = {
    url: 'https://s3.ap-south-1.amazonaws.com',
    path: '/oncobrief-documents/org/O/patient/P/doc/D/original.pdf',
    region: 'ap-south-1',
    service: 's3',
    method: 'PUT' as const,
    expiresSeconds: 900,
    credentials,
    now,
    contentType: 'application/pdf',
  };

  it('builds a query-signed URL with the expected parameters', () => {
    const out = presign(input);
    const url = new URL(out.url);
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('/ap-south-1/s3/aws4_request');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(out.requiredHeaders['content-type']).toBe('application/pdf');
    expect(out.expiresAt.toISOString()).toBe('2026-01-05T12:15:00.000Z');
  });

  it('rejects a tampered expiry (signature is bound to the params)', () => {
    const out = presign(input);
    const url = new URL(out.url);
    const signature = url.searchParams.get('X-Amz-Signature');
    url.searchParams.set('X-Amz-Expires', '9999');
    const forged = presign({ ...input, expiresSeconds: 9999 });
    expect(forged.url).not.toContain(`&X-Amz-Signature=${signature}&`);
  });
});
