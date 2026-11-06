import type { MigrationFile } from '@oncobrief/db/worker';
import m0 from '../../../packages/db/migrations/0001_bootstrap.sql';
import m1 from '../../../packages/db/migrations/0002_schema.sql';
import m2 from '../../../packages/db/migrations/0003_policies_grants.sql';
import m3 from '../../../packages/db/migrations/0004_auth_bootstrap_membership.sql';
import m4 from '../../../packages/db/migrations/0005_patient_message_created_at.sql';
import m5 from '../../../packages/db/migrations/0006_chat_history.sql';
import m6 from '../../../packages/db/migrations/0007_aws_ingestion.sql';
import m7 from '../../../packages/db/migrations/0008_lock_text_spans.sql';
import m8 from '../../../packages/db/migrations/0009_abdm_integration.sql';
import m9 from '../../../packages/db/migrations/0010_abdm_revoked_source_access.sql';
import m10 from '../../../packages/db/migrations/0011_v4_oncology_enhancement.sql';
import m11 from '../../../packages/db/migrations/0012_opd_transaction_safety.sql';
import m12 from '../../../packages/db/migrations/0013_opd_reservation_overlap.sql';
import m13 from '../../../packages/db/migrations/0014_guideline_chat_intent.sql';
import m14 from '../../../packages/db/migrations/0015_patient_attendance_confirmation.sql';
import m15 from '../../../packages/db/migrations/0016_foundation_users_clinicians_patients.sql';
import m16 from '../../../packages/db/migrations/0017_app_user_admin_rls.sql';
import m17 from '../../../packages/db/migrations/0018_task_origin_encounter.sql';
import m18 from '../../../packages/db/migrations/0019_oncology_operations_milestone_b.sql';
import m19 from '../../../packages/db/migrations/0020_remediation_rls_and_governance.sql';
import m20 from '../../../packages/db/migrations/0021_wave2_complete_scope.sql';
import m21 from '../../../packages/db/migrations/0022_patient_portal_foundation.sql';
import m22 from '../../../packages/db/migrations/0023_fhir_interoperability.sql';
import m23 from '../../../packages/db/migrations/0024_runtime_readiness.sql';
export const BUNDLED_MIGRATIONS: MigrationFile[] = [
  { name: '0001_bootstrap.sql', sql: m0 },
  { name: '0002_schema.sql', sql: m1 },
  { name: '0003_policies_grants.sql', sql: m2 },
  { name: '0004_auth_bootstrap_membership.sql', sql: m3 },
  { name: '0005_patient_message_created_at.sql', sql: m4 },
  { name: '0006_chat_history.sql', sql: m5 },
  { name: '0007_aws_ingestion.sql', sql: m6 },
  { name: '0008_lock_text_spans.sql', sql: m7 },
  { name: '0009_abdm_integration.sql', sql: m8 },
  { name: '0010_abdm_revoked_source_access.sql', sql: m9 },
  { name: '0011_v4_oncology_enhancement.sql', sql: m10 },
  { name: '0012_opd_transaction_safety.sql', sql: m11 },
  { name: '0013_opd_reservation_overlap.sql', sql: m12 },
  { name: '0014_guideline_chat_intent.sql', sql: m13 },
  { name: '0015_patient_attendance_confirmation.sql', sql: m14 },
  { name: '0016_foundation_users_clinicians_patients.sql', sql: m15 },
  { name: '0017_app_user_admin_rls.sql', sql: m16 },
  { name: '0018_task_origin_encounter.sql', sql: m17 },
  { name: '0019_oncology_operations_milestone_b.sql', sql: m18 },
  { name: '0020_remediation_rls_and_governance.sql', sql: m19 },
  { name: '0021_wave2_complete_scope.sql', sql: m20 },
  { name: '0022_patient_portal_foundation.sql', sql: m21 },
  { name: '0023_fhir_interoperability.sql', sql: m22 },
  { name: '0024_runtime_readiness.sql', sql: m23 },
];
