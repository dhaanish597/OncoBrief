import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env';

afterEach(() => { vi.unstubAllEnvs(); });
describe('production required configuration', () => {
  it('rejects missing database and session values instead of development defaults', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', undefined);
    vi.stubEnv('SESSION_COOKIE_SECRET', undefined);
    expect(() => env.databaseUrl).toThrow('missing_env:DATABASE_URL');
    expect(() => env.sessionSecret).toThrow('missing_env:SESSION_COOKIE_SECRET');
  });
});
