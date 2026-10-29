# OncoBrief — Database Architecture & Migrations Guide

## 1. Migration Architecture & Execution

Migrations are plain SQL files located in `packages/db/migrations/`, executed sequentially in transactional order using `pnpm db:migrate`. The migration runner (`packages/db/src/run-migrate.ts`) records applied migrations in the `schema_migration` table.

```bash
# Run pending migrations locally
pnpm db:migrate
```

Whenever a new migration file is created:
1. It must be named with the next incremental prefix (e.g. `0017_*.sql`).
2. It must be registered in `apps/worker/src/bundled-migrations.ts` for deployment packaging.
3. It must be added to `EXPECTED_MIGRATIONS` in `packages/db/src/demo-readiness.ts`.

---

## 2. Migration Index (0001 – 0017)

| Migration | Title | Purpose |
| :--- | :--- | :--- |
| `0001_bootstrap.sql` | Bootstrap Roles & Schema | Creates roles (`oncobrief_app`, `oncobrief_migrator`) and base extensions (`pgcrypto`). |
| `0002_schema.sql` | Core Data Model | Creates organizations, users, patients, documents, text spans, and evidence facts. |
| `0003_policies_grants.sql` | RLS Policies & Grants | Establishes forced RLS, tenant isolation, and append-only immutability triggers. |
| `0004_auth_bootstrap_membership.sql` | Auth Bootstrap | Functions for authentication and membership resolution. |
| `0005_patient_message_created_at.sql` | Message Timestamps | Adds created_at timestamp to patient messages. |
| `0006_chat_history.sql` | Guidance Chat Logs | Guideline and consultation assistant conversation persistence. |
| `0007_aws_ingestion.sql` | S3 & Textract Support | S3 bucket storage references and async Textract OCR task tracking. |
| `0008_lock_text_spans.sql` | Provenance Immutability | Immutability triggers on text spans and extracted coordinates. |
| `0009_abdm_integration.sql` | ABDM HIP/HIU Gateway | ABHA addresses, consent artifacts, and health information exchanges. |
| `0010_abdm_revoked_source_access.sql` | Consent Revocation | Revocation auditing and source redaction triggers. |
| `0011_v4_oncology_enhancement.sql` | V4 Evidence Foundation | Oncology checklists, conflict sets, and consultation packets. |
| `0012_opd_transaction_safety.sql` | OPD Queue Transactions | Safe concurrency locks and queue progression constraints. |
| `0013_opd_reservation_overlap.sql` | Reservation Safety | Prevents double-booking of outpatient consultation appointment slots. |
| `0014_guideline_chat_intent.sql` | Guideline Intent Auditing | Records clinical query intent without diagnostic scoring. |
| `0015_patient_attendance_confirmation.sql` | Attendance Verification | Front-desk patient check-in timestamps and attendance status. |
| `0016_foundation_users_clinicians_patients.sql` | Milestone A Schema Foundation | Adds facilities, departments, clinician profiles, invitations, care teams, and patient demographics. |
| `0017_app_user_admin_rls.sql` | Admin User Management RLS | Enables administrators to create users and supports invitation token activation under RLS. |

---

## 3. Milestone A Schema Additions (0016 & 0017)

### `facility`
Represents physical hospital campuses and ambulatory cancer treatment sites:
```sql
CREATE TABLE facility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL,
  code text NOT NULL,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code),
  UNIQUE (org_id, id)
);
```

### `department`
Represents specialized clinical oncology departments within a facility:
```sql
CREATE TABLE department (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  facility_id uuid REFERENCES facility(id),
  name text NOT NULL,
  code text NOT NULL,
  specialty text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, facility_id) REFERENCES facility(org_id, id)
);
```

### `clinician_profile`
Maintains clinical credentials, specialties, licenses, and room locations:
```sql
CREATE TABLE clinician_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  user_id uuid NOT NULL REFERENCES app_user(id),
  department_id uuid,
  specialty text NOT NULL,
  sub_specialty text,
  license_number text,
  consultation_room text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, department_id) REFERENCES department(org_id, id)
);
```

### `user_invitation`
Supports secure administrative onboarding:
```sql
CREATE TABLE user_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  department_id uuid,
  specialty text,
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES app_user(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);
```

### `patient_care_team`
Assigns multidisciplinary care team members to each cancer patient:
```sql
CREATE TABLE patient_care_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organization(id),
  patient_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES app_user(id),
  role_in_team text NOT NULL DEFAULT 'primary_oncologist',
  is_active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES app_user(id),
  notes text,
  UNIQUE (org_id, patient_id, user_id),
  FOREIGN KEY (org_id, patient_id) REFERENCES patient(org_id, id)
);
```

---

## 4. Forced PostgreSQL Row-Level Security (RLS)

Every tenant table is protected by:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <table>
  USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
```

When web requests execute through `withSession(...)`, the application sets session context parameters on the transaction:
```sql
SELECT set_config('app.org_id', $1, true);
SELECT set_config('app.user_id', $2, true);
SELECT set_config('app.role', $3, true);
```
Even if application code fails to include `WHERE org_id = ...`, PostgreSQL's internal query planner enforces isolation at the storage layer.

---

## 5. Append-Only Immutability Protections

Tables forming the clinical audit trail and legal evidence ledger cannot be updated or deleted:
- `evidence_fact`
- `ledger_entry`
- `audit_event`
- `record_readiness_snapshot`

The database trigger `oncobrief_block_mutation()` intercepts any `UPDATE` or `DELETE` attempt at the database level and raises an uncatchable exception:
```sql
CREATE OR REPLACE FUNCTION oncobrief_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append_only_table: % cannot be %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;
```
Even a user or application process with superuser access cannot overwrite historical clinical evidence facts.
