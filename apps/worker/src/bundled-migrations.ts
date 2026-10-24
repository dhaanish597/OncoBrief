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
import m0008 from '../../../packages/db/migrations/0008_lock_text_spans.sql';
import m0009 from '../../../packages/db/migrations/0009_abdm_integration.sql';

import m0010 from '../../../packages/db/migrations/0010_abdm_revoked_source_access.sql';

import m0011 from '../../../packages/db/migrations/0011_v4_oncology_enhancement.sql';

import m0012 from '../../../packages/db/migrations/0012_opd_transaction_safety.sql';

import m0013 from '../../../packages/db/migrations/0013_opd_reservation_overlap.sql';
import m0014 from '../../../packages/db/migrations/0014_guideline_chat_intent.sql';
import m0015 from '../../../packages/db/migrations/0015_patient_attendance_confirmation.sql';

export const BUNDLED_MIGRATIONS: MigrationFile[] = [
  { name: '0001_bootstrap.sql', sql: m0001 },
  { name: '0002_schema.sql', sql: m0002 },
  { name: '0003_policies_grants.sql', sql: m0003 },
  { name: '0004_auth_bootstrap_membership.sql', sql: m0004 },
  { name: '0005_patient_message_created_at.sql', sql: m0005 },
  { name: '0006_chat_history.sql', sql: m0006 },
  { name: '0007_aws_ingestion.sql', sql: m0007 },
  { name: '0008_lock_text_spans.sql', sql: m0008 },
  { name: '0009_abdm_integration.sql', sql: m0009 },
  { name: '0010_abdm_revoked_source_access.sql', sql: m0010 },
  { name: '0011_v4_oncology_enhancement.sql', sql: m0011 },
  { name: '0012_opd_transaction_safety.sql', sql: m0012 },
  { name: '0013_opd_reservation_overlap.sql', sql: m0013 },
  { name: '0014_guideline_chat_intent.sql', sql: m0014 },
  { name: '0015_patient_attendance_confirmation.sql', sql: m0015 },
];
