import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigratorPool } from './client';
import { applyMigrationList, type MigrationFile } from './migration-runner';

/**
 * CLI migrator. Reads the migrations directory and applies each file in order.
 * The pure bookkeeping lives in `migration-runner.ts`; this file owns only the
 * filesystem/database plumbing and is excluded from Lambda bundles.
 */

export type { MigrationFile } from './migration-runner';
export { applyMigrationList } from './migration-runner';

export async function migrate(log: (msg: string) => void = () => {}): Promise<string[]> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = resolve(here, '..', 'migrations');

  const files: MigrationFile[] = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));

  const pool = getMigratorPool();
  const client = await pool.connect();
  try {
    return await applyMigrationList(client, files, log);
  } finally {
    client.release();
  }
}
