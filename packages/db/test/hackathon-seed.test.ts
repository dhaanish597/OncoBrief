import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedFreshHackathon } from '../src/seed';
import { closePools, getMigratorPool } from '../src/client';
import { setupFixtures } from './helpers';
import { migrate } from '../src/migrate';
import { randomUUID } from 'node:crypto';

beforeAll(setupFixtures, 120_000);
afterAll(closePools);
afterEach(() => { vi.unstubAllEnvs(); });

describe('non-destructive hackathon initializer', () => {
  it('rejects an ordinary database before changing any records', async () => {
    const before = await getMigratorPool().query('SELECT count(*)::int AS n FROM organization');
    await expect(seedFreshHackathon()).rejects.toThrow('hackathon_initialization_requires_dedicated_database');
    const after = await getMigratorPool().query('SELECT count(*)::int AS n FROM organization');
    expect(after.rows).toEqual(before.rows);
  });

  it('refuses an already populated database even with explicit hackathon opt-in', async () => {
    vi.stubEnv('ONCOBRIEF_DEPLOYMENT_PROFILE', 'hackathon');
    vi.stubEnv('ONCOBRIEF_DEMO_MODE', 'true');
    vi.stubEnv('ONCOBRIEF_FRESH_SEED', 'I_CONFIRM_EMPTY_HACKATHON_DATABASE');
    const before = await getMigratorPool().query('SELECT count(*)::int AS n FROM organization');
    await expect(seedFreshHackathon()).rejects.toThrow('hackathon_initialization_requires_empty_database');
    expect((await getMigratorPool().query('SELECT count(*)::int AS n FROM organization')).rows).toEqual(before.rows);
  });

  it('initializes a fresh database as its non-superuser owner and restores forced RLS before commit', async () => {
    const name = `hackathon_seed_${randomUUID().replaceAll('-', '')}`;
    const originalApp = new URL(process.env.DATABASE_URL!);
    const originalMigrator = new URL(process.env.DATABASE_MIGRATOR_URL!);
    await getMigratorPool().query(`CREATE DATABASE "${name}"`);
    await closePools();
    originalApp.pathname = name;
    originalMigrator.pathname = name;
    vi.stubEnv('DATABASE_URL', originalApp.toString());
    vi.stubEnv('DATABASE_MIGRATOR_URL', originalMigrator.toString());
    vi.stubEnv('ONCOBRIEF_DEPLOYMENT_PROFILE', 'hackathon');
    vi.stubEnv('ONCOBRIEF_DEMO_MODE', 'true');
    vi.stubEnv('ONCOBRIEF_FRESH_SEED', 'I_CONFIRM_EMPTY_HACKATHON_DATABASE');
    try {
      await migrate();
      // Model RDS: the table owner can perform DDL but cannot bypass forced RLS.
      await getMigratorPool().query('SET ROLE oncobrief_migrator');
      const expected = (await getMigratorPool().query("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relforcerowsecurity")).rows[0]!.n;
      const summary = await seedFreshHackathon();
      expect(summary.patients).toHaveLength(3);
      expect((await getMigratorPool().query("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relforcerowsecurity")).rows[0]!.n).toBe(expected);
      expect((await getMigratorPool().query('SELECT count(*)::int AS n FROM patient')).rows[0]!.n).toBe(0);
    } finally { await closePools(); }
  }, 120_000);
});
