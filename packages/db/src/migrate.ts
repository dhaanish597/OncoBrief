import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigratorPool } from './client';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '..', 'migrations');

/** Bootstrap is idempotent and must run before tracking exists. */
const ALWAYS_RUN = new Set(['0001_bootstrap.sql']);

export async function migrate(log: (msg: string) => void = () => {}): Promise<string[]> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pool = getMigratorPool();
  const client = await pool.connect();
  const appliedNow: string[] = [];
  try {
    for (const file of files) {
      if (!ALWAYS_RUN.has(file)) {
        const already = await client.query<{ id: string }>(
          `SELECT id FROM schema_migration WHERE id = $1`,
          [file],
        );
        if (already.rowCount && already.rowCount > 0) {
          log(`skip   ${file} (already applied)`);
          continue;
        }
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migration (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
          [file],
        );
        await client.query('COMMIT');
        appliedNow.push(file);
        log(`apply  ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `migration_failed:${file}\n${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } finally {
    client.release();
  }
  return appliedNow;
}
