import { closePools } from "./client";
import { seed } from "./seed";

/**
 * Idempotent judging-day reset: guard the explicit local fixture database, truncate tenant data, re-seed
 * fixtures and re-run the ingestion pipeline for real. Prints the demo login
 * credentials. No network access is required.
 */
async function main(): Promise<void> {
  const summary = await seed((m) => console.log(m));

  console.log("\n==================== demo credentials ====================");
  for (const c of summary.credentials) {
    console.log(`  ${c.email.padEnd(28)} ${c.password}   (${c.role})`);
  }
  console.log("==========================================================");
  console.log(
    `patients: ${summary.patients.length}  documents: ${summary.documents}  facts: ${summary.facts}`,
  );
  console.log(
    `conflicts: ${summary.conflicts}  gaps: ${summary.gaps}  tasks: ${summary.tasks}`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
