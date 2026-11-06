/** One-off ECS task for a NEW synthetic database. Never use against retained data. */
import { createEcsCredentialsProvider, getSecretJson } from '../packages/adapters/src/index';

let stage = 'configuration';

async function main(): Promise<void> {
  if (process.env.ONCOBRIEF_DEPLOYMENT_PROFILE !== 'hackathon' || !process.env.DATABASE_URL || !process.env.DB_MASTER_SECRET_ARN) {
    throw new Error('hackathon_bootstrap_configuration_missing');
  }
  const mode = process.env.HACKATHON_BOOTSTRAP_MODE ?? 'fresh';
  if (!['fresh', 'migrate'].includes(mode)) throw new Error('invalid_hackathon_bootstrap_mode');
  stage = 'task-credentials';
  const credentials = await createEcsCredentialsProvider(process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ?? '')();
  stage = 'master-secret';
  const master = await getSecretJson(process.env.DB_MASTER_SECRET_ARN, { region: 'ap-south-1', credentials });
  if (typeof master.username !== 'string' || typeof master.password !== 'string') throw new Error('invalid_master_secret');
  const runtime = new URL(process.env.DATABASE_URL);
  if (!runtime.hostname.startsWith('oncobrief-hackathon-db.') || runtime.pathname !== '/oncobrief') throw new Error('wrong_hackathon_database');
  const migrator = new URL(runtime);
  migrator.username = master.username;
  migrator.password = master.password;
  process.env.DATABASE_MIGRATOR_URL = migrator.toString();
  const { migrate } = await import('../packages/db/src/migrate');
  const { getMigratorPool, closePools } = await import('../packages/db/src/client');
  const { seedFreshHackathon } = await import('../packages/db/src/seed');
  try {
    stage = 'migrations';
    const applied = await migrate();
    stage = 'runtime-password';
    const pool = getMigratorPool();
    // Parameterize the value before placing the PostgreSQL-quoted literal in DDL.
    const quoted = await pool.query<{ password_literal: string }>('SELECT quote_literal($1) AS password_literal', [decodeURIComponent(runtime.password)]);
    await pool.query(`ALTER ROLE oncobrief_app WITH LOGIN PASSWORD ${quoted.rows[0]!.password_literal}`);
    const role = (await pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='oncobrief_app'")).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls) throw new Error('unsafe_runtime_role');
    if (mode === 'migrate') {
      console.log(JSON.stringify({ status: 'migrated', appliedMigrations: applied.length }));
      return;
    }
    process.env.ONCOBRIEF_FRESH_SEED = 'I_CONFIRM_EMPTY_HACKATHON_DATABASE';
    // Seeding uses deterministic fixture text/spans, never external patient/provider data.
    process.env.OCR_DRIVER = 'local-pdf';
    process.env.EXTRACTION_DRIVER = 'rule';
    stage = 'synthetic-fixtures';
    const summary = await seedFreshHackathon();
    console.log(JSON.stringify({ status: 'initialized', appliedMigrations: applied.length, organizations: summary.orgs.length, syntheticPatients: summary.patients.length, documents: summary.documents, facts: summary.facts }));
  } finally { await closePools(); }
}

main().catch((error: unknown) => {
  // Never serialize connection URLs or provider secret responses to CloudWatch.
  const candidate = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const code = /^[A-Z0-9_]{1,40}$/.test(candidate) ? candidate : undefined;
  const migration = error instanceof Error && error.message.startsWith('migration_failed:')
    ? error.message.split('\n')[0] : undefined;
  console.error(JSON.stringify({ status: 'hackathon_bootstrap_failed', stage, code, migration }));
  process.exitCode = 1;
});
