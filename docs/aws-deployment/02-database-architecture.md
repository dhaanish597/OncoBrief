# AGENT 2 — DATABASE AND DATA ENGINEERING ARCHITECTURE

**Document ID:** `02-database-architecture.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Role:** Agent 2 — Database and Data Engineering Specialist  

---

## 1. Executive Summary & Epistemic Classification

OncoBrief’s clinical safety and tenant isolation guarantees are enforced directly inside **PostgreSQL 16** via `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` across **63 tenant-scoped tables** (`66` total RLS tables across `23` sequential SQL migrations), `BEFORE UPDATE OR DELETE` immutability triggers (`oncobrief_forbid_mutation`), and dual per-organization SHA-256 hash chains (`ledger_entry` and `audit_event`).

- **`[VERIFIED]`**: Confirmed in `packages/db/migrations/0001..0023`, `packages/db/src/client.ts`, `apps/worker/src/bundled-migrations.ts`, and `infra/modules/rds/main.tf`.
- **`[INFERRED]`**: Storage growth and connection saturation projections derived from actual row widths and RDS parameter formulas.
- **`[RECOMMENDED]`**: Database sizing, pooling, TLS, backup, and migration changes.

---

## 2. Schema, Migration History & Critical Worker Drift (`[VERIFIED]`)

### 2.1 Complete 23-Migration Inventory (`packages/db/migrations/`)

| Migration File | Scope & Key Tables / Objects | RLS & Trigger Posture |
| :--- | :--- | :--- |
| `0001_bootstrap.sql` | Creates `pgcrypto`, `oncobrief_migrator` (DDL owner) and `oncobrief_app` (`NOSUPERUSER NOBYPASSRLS`) | Role foundation (`[VERIFIED]`) |
| `0002_schema.sql` | Core 24 tables (`organization`, `app_user`, `membership`, `user_session`, `patient`, `document`, `document_page`, `text_span`, `evidence_fact`, `evidence_state`, `ledger_entry`, `conflict_set`, `admin_task`, `consultation_packet`, `patient_message`, `audit_event`, `extension_grant`, etc.) | Core relational & JSONB schema (`[VERIFIED]`) |
| `0003_policies_grants.sql` | `app_current_org_id()`, `ENABLE + FORCE ROW LEVEL SECURITY` on 21 tenant tables, `oncobrief_forbid_mutation` trigger on `ledger_entry` & `audit_event`, `auth_lookup_user`, `auth_lookup_session` | Fail-closed RLS + Append-only triggers (`[VERIFIED]`) |
| `0004` – `0008` | Auth membership lookup (`0004`), message timestamps (`0005`), `conversation` & `chat_message` (`0006`), `document_ingestion_job` (`0007`), `text_span` immutability trigger (`0008`) | `ENABLE + FORCE RLS` + locked OCR spans (`[VERIFIED]`) |
| `0009` – `0010` | ABDM V3 M1/M2/M3 tables (`0009`) + `RESTRICTIVE` RLS policy `abdm_source_access` (`0010`) hiding spans/facts when `document.ingest_error = 'consent_revoked_or_expired'` | Non-destructive consent revocation quarantine (`[VERIFIED]`) |
| `0011` – `0015` | V4 Oncology (`opd_appointment_slot`, `opd_waitlist_entry`, `opd_slot_event`, `guideline_document`, `guideline_span`, `studio_artifact`, `caregiver_contact`, attendance confirmation) | `ENABLE + FORCE RLS` + reservation overlap index (`[VERIFIED]`) |
| `0016` – `0019` | Milestone A (`facility`, `department`, `clinician_profile`, `user_invitation`, `patient_care_team`, `user_totp`) & Milestone B (`clinic_session`, `appointment`, `encounter`, `encounter_note_version`, `tumor_board_meeting`, `tumor_board_case`) | Operational & clinical workflow schema (`[VERIFIED]`) |
| `0020_remediation_rls_and_governance.sql` | Enforces `ENABLE + FORCE ROW LEVEL SECURITY` across all 14 Milestone A/B tables + composite `(org_id, patient_id, id)` FKs + governance triggers `validate_tumor_board_case_governance` & `validate_encounter_note_governance` | Closes Milestone A/B RLS & citation governance (`[VERIFIED]`) |
| `0021_wave2_complete_scope.sql` | Document packet segmentation (`parent_document_id`), workflow graph persistence | `ENABLE + FORCE RLS` (`[VERIFIED]`) |
| `0022_patient_portal_foundation.sql` | `patient_portal_session`, `patient_document_review`, `patient_discrepancy_flag`, `patient_preparation_state`, `patient_share_grant`, `patient_otp_challenge` | Compound Staff + Patient/Caregiver RLS (`[VERIFIED]`) |
| `0023_fhir_interoperability.sql` | `fhir_endpoint_registry`, `fhir_resource_link`, `fhir_exchange_transaction` | `ENABLE + FORCE RLS` (`[VERIFIED]`) |

### 2.2 Critical P0 Blocker: `apps/worker/src/bundled-migrations.ts` Drift (`[VERIFIED]`)
- **Finding:** `packages/db/migrations/` contains **23 SQL files** (`0001`–`0023`), but `apps/worker/src/bundled-migrations.ts:10-54` only imports **19 SQL files** (`0001`–`0019`), omitting **`0020_remediation_rls_and_governance.sql`**, **`0021_wave2_complete_scope.sql`**, **`0022_patient_portal_foundation.sql`**, and **`0023_fhir_interoperability.sql`**!
- **Impact:** Because RDS is in a private subnet with no public bastion, migrations on AWS are applied by invoking `oncobrief-dev-admin` Lambda (`{"action":"migrate"}` in `apps/worker/src/admin.ts:81`). Running `adminHandler` with the current bundle leaves the 14 Milestone A/B tables on RDS **without `FORCE ROW LEVEL SECURITY` (`0020`)** and leaves Wave 2, Patient Portal, and FHIR R4 tables uncreated!
- **Required Fix (`[RECOMMENDED]`):** Update `apps/worker/src/bundled-migrations.ts` (and auto-generate it in `apps/worker/scripts/build.mjs`) to include `0020` through `0023`.

---

## 3. Transaction-Scoped RLS & Connection Pooling Analysis (`[VERIFIED]`)

### 3.1 How `withTenant` Protects Pooled Connections (`packages/db/src/client.ts:192-215`)
```typescript
await client.query('BEGIN');
await client.query('SELECT set_config($1, $2, true)', ['app.org_id', ctx.orgId]);
await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', ctx.orgId]);
await client.query('SELECT set_config($1, $2, true)', ['app.user_id', ctx.userId ?? '']);
await client.query('SELECT set_config($1, $2, true)', ['app.role', ctx.role ?? '']);
const result = await fn(client);
await client.query('COMMIT');
```
- Because the third parameter to `set_config(setting_name, new_value, is_local)` is `true`, PostgreSQL scopes all four GUC settings strictly to the current transaction (`SET LOCAL`).
- The instant `COMMIT` or `ROLLBACK` executes, PostgreSQL resets `app.org_id` to empty/NULL before `client.release()` returns the socket to `appPool`.
- If any query runs outside `withTenant()`, `NULLIF(current_setting('app.org_id', true), '')::uuid` evaluates to `NULL`, and `org_id = NULL` returns **zero rows** (fail-closed).

### 3.2 Why Amazon RDS Proxy Should Be Avoided at Pilot Scale (`[VERIFIED]`)
- Per official [AWS RDS Proxy Pinning Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-pinning.html), RDS Proxy for PostgreSQL **pins the underlying database connection to the client session whenever it detects any `SET` or `SELECT set_config(...)` statement**.
- Adding RDS Proxy costs **$21.90/month minimum** (`2 vCPU minimum × $0.015/vCPU-hr × 730 hrs`) while providing restricted multiplexing due to session pinning.
- Instead, cap `appPool` to `max: 8` on ECS Fargate web tasks and `max: 2` on Lambda workers (`scaling_config { maximum_concurrency = 5 }`), keeping total connections under `30`—well below `db.t4g.micro` (`~85–112` max connections) and `db.t4g.small` (`~225` max connections). When scaling beyond 5 hospitals (Architecture C), use **PgBouncer in `pool_mode = transaction`**, which cleanly unbinds connections after `COMMIT` when `set_config(..., true)` is transaction-local.

---

## 4. Database Hosting Comparison in `ap-south-1` (Mumbai)

| Database Option | Compute + Storage Sizing | Monthly Cost (USD / INR @ ₹84.50) | RLS & Trigger Compatibility | HA / RPO / RTO | Verdict |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **1a. Amazon RDS PostgreSQL 16 (`db.t4g.micro` Single-AZ)** | `2 vCPU, 1 GiB RAM` + `20 GB gp3` + 7-day free backup | **`$17.95/mo`** (`₹1,517`) (`$15.33` compute + `$2.62` storage) | **100% Native** | Single-AZ; `RPO <= 5 min` (PITR), `RTO ~15–25 min` | **Selected for Architecture A (Demo) & Early 25-User Pilot** |
| **1b. Amazon RDS PostgreSQL 16 (`db.t4g.small` Single-AZ)** | `2 vCPU, 2 GiB RAM` + `30 GB gp3` + 14-day backup | **`$34.59/mo`** (`₹2,923`) (`$30.66` compute + `$3.93` storage) | **100% Native** (`~225` max conns) | Single-AZ; `RPO <= 5 min` (PITR), `RTO ~15–25 min` | **Selected for Architecture B (100-User Single-Hospital Pilot)** |
| **1c. Amazon RDS PostgreSQL 16 (`db.t4g.medium` Multi-AZ)** | `2 vCPU, 4 GiB RAM` Multi-AZ + `100 GB gp3` + 35-day backup | **`$148.84/mo`** (`₹12,577`) (`$122.64` compute + `$26.20` storage) | **100% Native** (`~450` max conns) | Synchronous Standby; `RPO = 0`, `RTO = 60–120s` | **Selected for Architecture C (5–20 Hospital Production)** |
| **2. Aurora PostgreSQL Serverless v2** | `0.5 ACU` min floor (`$0.145/ACU-hr` in `ap-south-1`) + storage/IO | **`$55.00–$75.00+/mo`** (`₹4,648–₹6,338+`) | 100% Native | Multi-AZ storage | **Rejected:** Idle floor (`$52.93/mo`) is `3.45×` `db.t4g.micro` and `1.73×` `db.t4g.small` with zero architectural benefit at 1–5 hospitals. |
| **3. Self-Managed Postgres 16 on EC2 (`t4g.small`)** | `t4g.small` + `20 GB gp3` EBS | **`~$12.50/mo`** (`₹1,056`) | Manual setup | Manual WAL/snapshots; high operational risk | **Rejected:** Unacceptable patient data-loss risk to save `~$5–$18/mo`. |
| **4. External Managed Postgres (Neon / Supabase)** | External SaaS DB | **`$19.00–$25.00+/mo`** | Role & `0001_bootstrap.sql` conflicts | Public internet ingress; cross-cloud latency | **Rejected:** Fails private VPC isolation and hospital data-processing controls. |

---

## 5. Storage Growth Model & TLS Hardening (`[VERIFIED]` + `[INFERRED]`)

- **Storage Footprint per Document:** Raw PDFs/scans live in S3 (`oncobrief-documents-*`). PostgreSQL stores only `document` metadata, `document_page`, `text_span` coordinates, `evidence_fact`, `ledger_entry`, and `audit_event` rows—averaging **~114 KB per 10-page document** (including B-Tree and GIN index overhead).
  - **100-User Hospital (`2,500 docs/mo`):** `+342 MB/month` (`~4.1 GB/year`). A `20–30 GB gp3` volume (`$2.62–$3.93/mo`) with `max_allocated_storage = 100` provides multi-year headroom.
- **Mandatory TLS Verification Fix (`[VERIFIED]` — Blocker `P0-3`):**
  - `packages/db/src/client.ts:81-165` already implements `resolvePoolOptions()` with `rds-global-bundle.pem` (`rejectUnauthorized: true`) when `sslmode=verify-full` is appended to `DATABASE_URL`.
  - However, `infra/environments/dev/main.tf:115` and `infra/modules/web/main.tf:115` pass `?sslmode=require`, and `apps/worker/src/admin.ts:74, 294` hardcodes `ssl: { rejectUnauthorized: false }`.
  - **Action:** Update `DATABASE_URL` in Terraform to `?sslmode=verify-full`, bundle `packages/db/certs/rds-global-bundle.pem` into `infra/build/worker/`, and use `resolvePoolOptions()` in `apps/worker/src/admin.ts`.
