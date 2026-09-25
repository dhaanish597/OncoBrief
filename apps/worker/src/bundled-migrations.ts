import type { MigrationFile } from '@oncobrief/db/worker';

/**
 * Migrations bundled as strings for the admin Lambda (ADR 0015).
 *
 * The CLI migrator reads these files from disk; inside a Lambda zip there is no
 * migrations directory, so esbuild inlines them with the `text` loader. Both
 * paths call `applyMigrationList`, so the bookkeeping is identical.
 */
import m0001 from '../../../packages/db/migrations/0001_bootstrap.sql';
import m0002 from '../../../packages/db/migrations/0002_schema.sql';
import m0003 from '../../../packages/db/migrations/0003_policies_grants.sql';
import m0004 from '../../../packages/db/migrations/0004_auth_bootstrap_membership.sql';
import m0005 from '../../../packages/db/migrations/0005_patient_message_created_at.sql';
import m0006 from '../../../packages/db/migrations/0006_chat_history.sql';
import m0007 from '../../../packages/db/migrations/0007_aws_ingestion.sql';

export const BUNDLED_MIGRATIONS: MigrationFile[] = [
  { name: '0001_bootstrap.sql', sql: m0001 },
  { name: '0002_schema.sql', sql: m0002 },
  { name: '0003_policies_grants.sql', sql: m0003 },
  { name: '0004_auth_bootstrap_membership.sql', sql: m0004 },
  { name: '0005_patient_message_created_at.sql', sql: m0005 },
  { name: '0006_chat_history.sql', sql: m0006 },
  { name: '0007_aws_ingestion.sql', sql: m0007 },
];
