/**
 * Migration bookkeeping, independent of any filesystem access (ADR 0015).
 *
 * Split out of `migrate.ts` so it can be bundled into a Lambda without pulling
 * `import.meta.url`, `node:fs` or the migrations directory. The CLI reads the
 * SQL files and calls this; the admin Lambda imports the SQL as strings and
 * calls the same function, so the recorded history is identical either way.
 */

/** Bootstrap is idempotent and must run before tracking exists. */
const ALWAYS_RUN = new Set(['0001_bootstrap.sql']);

export interface MigrationFile {
  name: string;
  sql: string;
}

export async function applyMigrationList(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  files: MigrationFile[],
  log: (msg: string) => void = () => {},
): Promise<string[]> {
  const appliedNow: string[] = [];
  for (const file of files) {
    if (!ALWAYS_RUN.has(file.name)) {
      const already = (await client.query(`SELECT id FROM schema_migration WHERE id = $1`, [
        file.name,
      ])) as { rowCount: number | null };
      if (already.rowCount && already.rowCount > 0) {
        log(`skip   ${file.name} (already applied)`);
        continue;
      }
    }
    await client.query('BEGIN');
    try {
      await client.query(file.sql);
      await client.query(
        `INSERT INTO schema_migration (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
        [file.name],
      );
      await client.query('COMMIT');
      appliedNow.push(file.name);
      log(`apply  ${file.name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(
        `migration_failed:${file.name}\n${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return appliedNow;
}
