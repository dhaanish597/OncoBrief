import { describe, expect, it } from 'vitest';
import { createEcsCredentialsProvider } from '../src/ecs-credentials';
import { S3StorageAdapter } from '../src/s3-storage';

describe('ECS storage credentials', () => {
  it('reuses valid credentials and refreshes before expiration', async () => {
    let now = Date.parse('2026-11-05T00:00:00Z');
    let calls = 0;
    const provider = createEcsCredentialsProvider('/v2/credentials/test', {
      now: () => now,
      fetchImpl: async (url) => {
        expect(String(url)).toBe('http://169.254.170.2/v2/credentials/test');
        calls++;
        return Response.json({ AccessKeyId: `key-${calls}`, SecretAccessKey: 'test-secret', Token: 'session', Expiration: new Date(now + 600_000).toISOString() });
      },
    });
    expect((await provider()).accessKeyId).toBe('key-1');
    expect((await provider()).accessKeyId).toBe('key-1');
    now += 550_000;
    expect((await provider()).accessKeyId).toBe('key-2');
    expect(calls).toBe(2);
  });

  it('rejects metadata URL injection and malformed credential responses', async () => {
    expect(() => createEcsCredentialsProvider('//evil.example/credentials')).toThrow('invalid_ecs_credentials_path');
    const provider = createEcsCredentialsProvider('/v2/credentials/test', { fetchImpl: async () => Response.json({ Token: 'missing-fields' }) });
    await expect(provider()).rejects.toThrow('invalid_ecs_credentials_response');
  });

  it('signs storage requests with refreshed provider credentials and the session token', async () => {
    const adapter = new S3StorageAdapter({
      bucket: 'synthetic', region: 'ap-south-1', credentials: { accessKeyId: '', secretAccessKey: '' },
      credentialProvider: async () => ({ accessKeyId: 'task-role', secretAccessKey: 'test-secret', sessionToken: 'task-token' }),
      fetchImpl: async (_url, init) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.authorization).toContain('Credential=task-role/');
        expect(headers['x-amz-security-token']).toBe('task-token');
        return new Response('synthetic');
      },
    });
    expect((await adapter.get('org/synthetic/source.txt')).toString()).toBe('synthetic');
    const signed = new URL(await adapter.presignGet('org/synthetic/source.txt', 60));
    expect(signed.searchParams.get('X-Amz-Security-Token')).toBe('task-token');
  });
});
