import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { S3StorageAdapter } from '../src/s3-storage';

const now = new Date('2026-01-05T12:00:00Z');

function makeAdapter(handler?: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : String(input);
    const requestInit = (init ?? {}) as RequestInit;
    calls.push({ url, init: requestInit });
    return handler ? handler(url, requestInit) : new Response(null, { status: 200 });
  };
  const adapter = new S3StorageAdapter({
    bucket: 'oncobrief-documents',
    region: 'ap-south-1',
    credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' },
    endpoint: 'http://localhost:4566',
    forcePathStyle: true,
    fetchImpl,
    now: () => now,
  });
  return { adapter, calls };
}

describe('S3StorageAdapter', () => {
  it('presigns a PUT with required headers and an expiry', async () => {
    const { adapter } = makeAdapter();
    const result = await adapter.presignPut('org/O/patient/P/doc/D/original.pdf', 'application/pdf', 900, 1234);
    const url = new URL(result.url);
    expect(url.pathname).toBe('/oncobrief-documents/org/O/patient/P/doc/D/original.pdf');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(result.requiredHeaders['content-type']).toBe('application/pdf');
    expect(result.requiredHeaders['content-length']).toBe('1234');
    expect(result.expiresAt).toBe('2026-01-05T12:15:00.000Z');
  });

  it('PUTs the body and returns the server-computed sha256', async () => {
    const { adapter, calls } = makeAdapter();
    const body = Buffer.from('%PDF-1.7 bytes');
    const out = await adapter.put('org/O/patient/P/doc/D/original.pdf', body, 'application/pdf');
    expect(out.sha256).toBe(createHash('sha256').update(body).digest('hex'));
    expect(calls).toHaveLength(1);
    // Regression: the request must address the object key, not just the origin.
    expect(calls[0]!.url).toBe(
      'http://localhost:4566/oncobrief-documents/org/O/patient/P/doc/D/original.pdf',
    );
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['authorization']).toContain('AWS4-HMAC-SHA256');
    expect(headers['x-amz-content-sha256']).toBe(out.sha256);
  });

  it('GETs an object and returns its bytes', async () => {
    const { adapter, calls } = makeAdapter(() => new Response(Buffer.from('hello'), { status: 200 }));
    const body = await adapter.get('org/O/patient/P/doc/D/original.pdf');
    expect(body.toString()).toBe('hello');
    expect(calls[0]!.url).toBe(
      'http://localhost:4566/oncobrief-documents/org/O/patient/P/doc/D/original.pdf',
    );
  });

  it('addresses virtual-hosted style without duplicating the bucket', async () => {
    const calls: { url: string }[] = [];
    const adapter = new S3StorageAdapter({
      bucket: 'oncobrief-documents',
      region: 'ap-south-1',
      credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' },
      forcePathStyle: false,
      fetchImpl: (async (input: string | URL) => {
        calls.push({ url: String(input) });
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch,
      now: () => now,
    });
    await adapter.put('org/O/k.txt', Buffer.from('x'), 'text/plain');
    expect(calls[0]!.url).toBe('https://oncobrief-documents.s3.ap-south-1.amazonaws.com/org/O/k.txt');
  });

  it('throws a typed error on a failed GET', async () => {
    const { adapter } = makeAdapter(() => new Response('nope', { status: 403 }));
    await expect(adapter.get('missing')).rejects.toThrow('s3_get_failed:403');
  });
});
