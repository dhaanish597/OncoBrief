import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const query = vi.hoisted(() => vi.fn());
vi.mock('@oncobrief/db', () => ({ getAppPool: () => ({ query }), repoRootPath: resolve(process.cwd(), '../..') }));
import { GET } from './route';

beforeEach(() => { query.mockReset(); });
describe('deployment readiness', () => {
  it('fails closed when a migration is missing', async () => {
    query.mockResolvedValue({ rows: [{ id: '0001_bootstrap.sql' }] });
    expect((await GET()).status).toBe(503);
  });
  it('reports readiness only when all shipped migrations are present', async () => {
    query.mockResolvedValue({ rows: readdirSync(resolve(process.cwd(), '../../packages/db/migrations')).filter(n => n.endsWith('.sql')).map(id => ({ id })) });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('does not disclose database exceptions', async () => {
    query.mockRejectedValue(new Error('sensitive database detail'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sensitive');
  });
});
