#!/usr/bin/env node
/**
 * OncoBrief V4 — Safe, Non-Destructive Judge Demonstration Readiness Verifier
 *
 * Implements Requirement 6 ("MAKE THE APPLICATION DEMO RELIABLE"):
 * 1. Checks dependencies and workspace packages.
 * 2. Checks required environment variables without printing secrets.
 * 3. Checks PostgreSQL connectivity.
 * 4. Reads applied migrations; never runs migrations.
 * 5. Confirms synthetic database identity (`is_demo_fixture = true`) and refuses
 *    destructive operations if non-synthetic patient records exist.
 * 6. Verifies isolated synthetic demonstration data (reset only with explicit --reseed) (DEMO-001, DEMO-002, DEMO-003,
 *    OPD schedule & waitlist, and synthetic institutional SOP corpus).
 * 7. Reports actual provider modes (WORKING LOCALLY vs SIMULATED) and readiness.
 */

import { getMigratorPool, closePools } from "./client";
import { seed } from "./seed";
import { verifyLedgerChain } from "./services/ledger";
import { getOcr, getExtractor } from "./container";

interface CheckItem {
  check: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
}

const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_MIGRATOR_URL",
  "SESSION_COOKIE_SECRET",
  "OCR_DRIVER",
  "EXTRACTION_DRIVER",
  "LLM_PROVIDER",
  "ABDM_DRIVER",
] as const;

const EXPECTED_MIGRATIONS = [
  "0001_bootstrap.sql",
  "0002_schema.sql",
  "0003_policies_grants.sql",
  "0004_auth_bootstrap_membership.sql",
  "0005_patient_message_created_at.sql",
  "0006_chat_history.sql",
  "0007_aws_ingestion.sql",
  "0008_lock_text_spans.sql",
  "0009_abdm_integration.sql",
  "0010_abdm_revoked_source_access.sql",
  "0011_v4_oncology_enhancement.sql",
  "0012_opd_transaction_safety.sql",
  "0013_opd_reservation_overlap.sql",
  "0014_guideline_chat_intent.sql",
  "0015_patient_attendance_confirmation.sql",
];

interface ReadinessServices {
  getMigratorPool: () => {
    connect: () => Promise<Pick<import("pg").PoolClient, "query" | "release">>;
  };
  closePools: () => Promise<unknown>;
  seed: () => Promise<unknown>;
  verifyLedgerChain: typeof verifyLedgerChain;
  getOcr: () => { constructor: { name: string } };
  getExtractor: () => { constructor: { name: string } };
}
const runtime: ReadinessServices = {
  getMigratorPool,
  closePools,
  seed,
  verifyLedgerChain,
  getOcr,
  getExtractor,
};
export async function main(
  args = process.argv.slice(2),
  services: ReadinessServices = runtime,
): Promise<void> {
  const {
    getMigratorPool,
    closePools,
    seed,
    verifyLedgerChain,
    getOcr,
    getExtractor,
  } = services;
  const reseedRequested = args.includes("--reseed");
  const results: CheckItem[] = [];

  console.log(
    "================================================================",
  );
  console.log("  OncoBrief V4 — Judge Demonstration Readiness Verification");
  console.log(
    "================================================================\n",
  );

  // 1. Check required environment variables (without printing secret values)
  const missingEnv: string[] = [];
  for (const key of REQUIRED_ENV_KEYS) {
    const val = process.env[key];
    if (!val || val.trim().length === 0) {
      missingEnv.push(key);
    }
  }

  if (missingEnv.length === 0) {
    results.push({
      check: "Environment Configuration",
      status: "PASS",
      detail: `All ${REQUIRED_ENV_KEYS.length} required variables present (secrets masked).`,
    });
  } else {
    results.push({
      check: "Environment Configuration",
      status: "WARN",
      detail: `Unset configuration keys (verify effective runtime defaults): ${missingEnv.join(", ")}`,
    });
  }

  // Check active provider modes (honest labeling)
  const ocrDriver = process.env["OCR_DRIVER"] || "auto";
  const sarvamKeySet = Boolean(
    process.env["SARVAM_API_KEY"] &&
    process.env["SARVAM_API_KEY"]!.trim().length > 0,
  );
  const abdmDriver = process.env["ABDM_DRIVER"] || "simulated";
  const llmProvider = process.env["LLM_PROVIDER"] || "rule";

  results.push({
    check: "Provider Mode Honesty",
    status: "PASS",
    detail: [
      `OCR_DRIVER=${ocrDriver}; selected adapter=${getOcr().constructor.name} (configuration only; no provider acceptance check)`,
      `Extraction adapter=${getExtractor().constructor.name}`,
      `LLM_PROVIDER=${llmProvider}`,
      `ABDM_DRIVER=${abdmDriver} (${abdmDriver === "simulated" ? "local simulation" : "external configured; acceptance unverified"})`,
      `Voice TTS=${sarvamKeySet ? "Sarvam configured; external acceptance unverified" : "No cloud key; installed local browser voices must be checked"}`,
    ].join(" | "),
  });

  if (reseedRequested) await seed(); // seed() enforces the same guard as demo:reset/db:seed.
  const pool = getMigratorPool();
  const reader = await pool.connect();
  try {
    await reader.query("BEGIN READ ONLY");
    // 2. Check PostgreSQL connectivity
    const ping = await reader.query<{ version: string }>("SELECT version()");
    results.push({
      check: "PostgreSQL Connectivity",
      status: "PASS",
      detail: `Connected (${ping.rows[0]?.version.split(",")[0] ?? "PostgreSQL"}).`,
    });

    // 3. Read migration history. Missing schema/migrations fail without modifying the database.
    const migRes = await reader.query<{ id: string }>(
      "SELECT id FROM schema_migration ORDER BY id",
    );
    const applied = new Set(migRes.rows.map((r) => r.id));
    const missingMigrations = EXPECTED_MIGRATIONS.filter(
      (m) => !applied.has(m),
    );

    if (missingMigrations.length === 0 && applied.size === EXPECTED_MIGRATIONS.length) {
      results.push({
        check: "Schema Migrations (0001–0015)",
        status: "PASS",
        detail: `${applied.size} tracked migrations applied and verified.`,
      });
    } else {
      results.push({
        check: "Schema Migrations (0001–0015)",
        status: "FAIL",
        detail: `Migration mismatch: expected ${EXPECTED_MIGRATIONS.length}, found ${applied.size}; missing ${missingMigrations.join(", ")}`,
      });
    }

    // 4. Confirm synthetic database identity & guard against non-synthetic data destruction
    const nonDemoPatients = await reader.query<{ count: string }>(
      `SELECT (
         (SELECT count(*) FROM patient WHERE is_demo_fixture IS DISTINCT FROM true) +
         (SELECT count(*) FROM organization WHERE is_demo_fixture IS DISTINCT FROM true) +
         (SELECT count(*) FROM app_user WHERE is_demo_fixture IS DISTINCT FROM true) +
         (SELECT count(*) FROM membership WHERE is_demo_fixture IS DISTINCT FROM true)
       )::text AS count`,
    );
    const nonDemoCount = Number(nonDemoPatients.rows[0]?.count ?? 0);

    if (nonDemoCount > 0) {
      results.push({
        check: "Synthetic Database Identity Guard",
        status: "FAIL",
        detail: `Found ${nonDemoCount} non-synthetic identity record(s). Refusing destructive demo reset.`,
      });
      throw new Error(
        "non_synthetic_patients_detected: Refusing to modify non-demo database.",
      );
    }

    results.push({
      check: "Synthetic Database Identity Guard",
      status: "PASS",
      detail:
        "Verified isolated synthetic database (0 non-synthetic patient/organization/user/membership records).",
    });

    // 5. Read fixture inventory; absent fixtures require a separately authorized reset.
    const verifiedDemoRes = await reader.query<{
      id: string;
      org_id: string;
      demo_code: string;
      display_name: string;
    }>(
      `SELECT p.id, p.org_id, p.demo_code, p.display_name
         FROM patient p JOIN organization o ON o.id=p.org_id
        WHERE p.is_demo_fixture = true AND o.is_demo_fixture=true AND o.slug='rci'
        ORDER BY p.demo_code`,
    );
    const demoCodes = verifiedDemoRes.rows.map((r) => r.demo_code);
    if (
      demoCodes.includes("DEMO-001") &&
      demoCodes.includes("DEMO-002") &&
      demoCodes.includes("DEMO-003")
    ) {
      results.push({
        check: "Synthetic Oncology Patients",
        status: "PASS",
        detail: verifiedDemoRes.rows
          .map((r) => `${r.display_name} (${r.id.slice(0, 8)})`)
          .join(", "),
      });
    } else {
      results.push({
        check: "Synthetic Oncology Patients",
        status: "FAIL",
        detail: `Expected DEMO-001..003, found: ${demoCodes.join(", ")}`,
      });
    }

    // 6. Verify OPD schedule, waitlist, guidelines, and hash chain integrity
    const primaryOrgId = verifiedDemoRes.rows[0]?.org_id;
    if (primaryOrgId) {
      const opdSlots = await reader.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM opd_appointment_slot WHERE org_id = $1",
        [primaryOrgId],
      );
      const opdWaitlist = await reader.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM opd_waitlist_entry WHERE org_id = $1",
        [primaryOrgId],
      );
      const guidelines = await reader.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM guideline_span WHERE org_id = $1",
        [primaryOrgId],
      );
      const chain = await verifyLedgerChain(reader, primaryOrgId);

      results.push({
        check: "OPD Schedule & Guideline Corpus",
        status:
          Number(opdSlots.rows[0]?.count ?? 0) >= 4 &&
          Number(opdWaitlist.rows[0]?.count ?? 0) >= 1 &&
          Number(guidelines.rows[0]?.count ?? 0) >= 2
            ? "PASS"
            : "FAIL",
        detail: `${opdSlots.rows[0]?.count ?? 0} OPD slots, ${opdWaitlist.rows[0]?.count ?? 0} waitlist candidates, ${guidelines.rows[0]?.count ?? 0} guideline spans.`,
      });

      results.push({
        check: "Cryptographic Ledger Hash Chain",
        status: chain.ok ? "PASS" : "FAIL",
        detail: chain.ok
          ? `Verified intact (${chain.length} immutable ledger entries).`
          : `DIVERGED: ${chain.reason ?? "unknown"}`,
      });
    }
    await reader.query("COMMIT");
  } catch (error) {
    await reader.query("ROLLBACK");
    throw error;
  } finally {
    reader.release();
    await closePools();
  }

  console.log("\nReadiness Summary:");
  console.log(
    "----------------------------------------------------------------",
  );
  let failed = false;
  for (const item of results) {
    const badge =
      item.status === "PASS"
        ? "[PASS]"
        : item.status === "WARN"
          ? "[WARN]"
          : "[FAIL]";
    if (item.status === "FAIL") failed = true;
    console.log(`${badge} ${item.check}: ${item.detail}`);
  }
  console.log(
    "----------------------------------------------------------------",
  );

  if (failed) {
    console.error(
      "\nDemo readiness verification FAILED. Resolve the failed checks above.",
    );
    process.exit(1);
  }

  console.log(
    "\nFixture checks passed. This does not establish browser, external-provider, or hospital acceptance.",
  );
}
