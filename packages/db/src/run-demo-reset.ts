import { closePools } from './client';
import { migrate } from './migrate';
import { seed } from './seed';

/**
 * Idempotent judging-day reset: apply migrations, truncate tenant data, re-seed
 * fixtures and re-run the ingestion pipeline for real. Prints the demo login
 * credentials. No network access is required.
 */
async function main(): Promise<void> {
  const applied = await migrate((m) => console.log(m));
  console.log(applied.length === 0 ? 'schema up to date' : `applied ${applied.length} migration(s)`);

  const summary = await seed((m) => console.log(m));

  console.log('\n==================== demo credentials ====================');
  for (const c of summary.credentials) {
    console.log(`  ${c.email.padEnd(28)} ${c.password}   (${c.role})`);
  }
  console.log('==========================================================');
  console.log(`patients: ${summary.patients.length}  documents: ${summary.documents}  facts: ${summary.facts}`);
  console.log(`conflicts: ${summary.conflicts}  gaps: ${summary.gaps}  tasks: ${summary.tasks}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
