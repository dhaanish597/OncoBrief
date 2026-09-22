import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Load the repository-root `.env` regardless of which workspace script runs.
 * `.env` is git-ignored; `.env.example` documents every key.
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const repoRoot = findRepoRoot(process.cwd());
const envPath = resolve(repoRoot, '.env');
if (existsSync(envPath)) loadDotenv({ path: envPath });
else if (existsSync(resolve(repoRoot, '.env.example'))) loadDotenv({ path: resolve(repoRoot, '.env.example') });

export const repoRootPath = repoRoot;

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

export const env = {
  get databaseUrl(): string {
    return required(
      'DATABASE_URL',
      'postgres://oncobrief_app:oncobrief_app@localhost:5432/oncobrief',
    );
  },
  get migratorUrl(): string {
    return required('DATABASE_MIGRATOR_URL', 'postgres://postgres:postgres@localhost:5432/oncobrief');
  },
  get sessionSecret(): string {
    return required('SESSION_COOKIE_SECRET', 'dev-only-insecure-secret-replace-me');
  },
  get storageDriver(): 'fs' | 's3' {
    return (process.env.STORAGE_DRIVER ?? 'fs') as 'fs' | 's3';
  },
  get storageFsRoot(): string {
    return resolve(repoRoot, process.env.STORAGE_FS_ROOT ?? '.var/storage');
  },
  get demoMode(): boolean {
    return (process.env.ONCOBRIEF_DEMO_MODE ?? 'true') === 'true';
  },
  isTest(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  },
};
