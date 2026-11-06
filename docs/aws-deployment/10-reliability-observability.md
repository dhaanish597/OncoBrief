# AGENT 10 — OBSERVABILITY, RELIABILITY, BACKUP VERIFICATION & DISASTER RECOVERY

**Document ID:** `10-reliability-observability.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Role:** Agent 10 — Observability and Reliability Engineer  

---

## 1. Current Observability, Health Check & PHI Logging Audit (`[VERIFIED]`)

### 1.1 Existing Monitoring Module (`infra/modules/monitoring/main.tf`)
- **What Exists (`[VERIFIED]`):** `infra/modules/monitoring/main.tf` provisions a CloudWatch Dashboard (`${var.name_prefix}-pipeline`) and baseline alarms on `document-dlq`, `ocr-dlq`, and Lambda `Errors`.
- **What Is Missing (`[VERIFIED]`):**
  1. **No SNS Alert Topic (`alarm_actions` is empty!):** Existing alarms in `infra/modules/monitoring/main.tf` transition to `ALARM` silently in the console without emailing or paging anyone.
  2. **Broken ALB Health Check (`infra/modules/web/main.tf:219`):** Target group probes `GET /login` -> `200`, which renders static HTML without testing PostgreSQL connectivity or verifying that all 23 SQL migrations (`0001`–`0023`) are applied.
  3. **No SQS Queue-Age Alarm (`ApproximateAgeOfOldestMessage > 300s`) or RDS Connection Alarm (`DatabaseConnections > 70`).**
  4. **Web Route Error Logging (`apps/web/src/app/api/v1/**/route.ts`):** While `apps/worker/src/logger.ts:23-36` (`JsonLogger`) and `packages/db/src/services/audit.ts:77-115` (`redactMetadata`) strip 18+ PHI keys, Next.js API routes do not yet use `JsonLogger`.

---

## 2. Dedicated Readiness Probe: `GET /api/v1/health` (`[RECOMMENDED]`)

Create `apps/web/src/app/api/v1/health/route.ts` (and whitelist `/api/v1/health` in `apps/web/src/middleware.ts`) to execute a 1.5-second bounded query against `getAppPool()`:
- Verifies `SELECT count(*)::int AS count, max(name) AS head FROM schema_migration` (`count >= 23`, `head = '0023_fhir_interoperability.sql'`).
- When called with `?deep=1` during CI/CD post-deploy smoke testing, verifies `relforcerowsecurity = true` on `>= 63` tenant tables.
- Returns `HTTP 200 OK` (`Cache-Control: no-store`) with `{ status: "ok", migrationCount: 23, latencyMs }` or `HTTP 503 Service Unavailable` with a redacted error code (never SQL parameters or PHI).
- Update `infra/modules/web/main.tf:219` `health_check.path = "/api/v1/health"`.

---

## 3. Minimal-Cost CloudWatch Alarm Matrix (`$0.12–$3.31/month` in `ap-south-1`) (`[RECOMMENDED]`)

Stay within the 10-alarm CloudWatch tier (`$0.00/mo` with AWS Always Free tier; `$1.00/mo` list price without Free Tier) wired to an encrypted `aws_sns_topic.alerts` email subscription:

| # | Alarm Name | Metric & Namespace | Threshold & Window | Action |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `${prefix}-web-5xx-high` | `AWS/ApplicationELB` `HTTPCode_Target_5XX_Count` | `Sum >= 10` in `5 mins` | P1 Alert -> SNS |
| **2** | `${prefix}-web-unhealthy-hosts` | `AWS/ApplicationELB` `UnHealthyHostCount` | `Max >= 1` for `2 mins` | P0 Critical -> SNS |
| **3** | `${prefix}-rds-cpu-high` | `AWS/RDS` `CPUUtilization` | `Avg > 80%` for `15 mins` | P1 Alert -> SNS |
| **4** | `${prefix}-rds-storage-low` | `AWS/RDS` `FreeStorageSpace` | `Min < 2 GiB` for `5 mins` | P0 Critical -> SNS |
| **5** | `${prefix}-rds-connections-high` | `AWS/RDS` `DatabaseConnections` | `Max > 70` (`micro`) / `150` (`small`) for `5 mins` | P1 Alert -> SNS |
| **6** | `${prefix}-document-dlq-visible` | `AWS/SQS` `ApproximateNumberOfMessagesVisible` (`document-dlq`) | `Max >= 1` in `1 min` | P0 Critical -> SNS |
| **7** | `${prefix}-ocr-dlq-visible` | `AWS/SQS` `ApproximateNumberOfMessagesVisible` (`ocr-dlq`) | `Max >= 1` in `1 min` | P0 Critical -> SNS |
| **8** | `${prefix}-document-ingest-age` | `AWS/SQS` `ApproximateAgeOfOldestMessage` (`document-ingest`) | `Max > 300s` for `3 mins` | P1 Alert -> SNS |
| **9** | `${prefix}-worker-lambda-errors` | `AWS/Lambda` `Errors` (`document-ingest` + `ocr-result`) | `Sum >= 1` in `1 min` | P1 Alert -> SNS |
| **10** | `${prefix}-hash-chain-integrity` | `OncoBrief/Integrity` `HashChainIntegrityFailure` | `Max >= 1` (or missing daily heartbeat, `treat_missing_data = "breaching"`) | P0 Security -> SNS |

---

## 4. RPO/RTO Targets, Backup Verification & Off-Box WORM Hash Anchoring (`[RECOMMENDED]`)

| Tier | RPO Target | RTO Target | Recovery Mechanism |
| :--- | :---: | :---: | :--- |
| **Demo (Arch A)** | `24 hours` (`0 min` synthetic seed) | `15–30 mins` | 7-day RDS automated backup + `seed-demo` admin Lambda |
| **Single-Hospital Pilot (Arch B)** | **`<= 5 minutes`** (`0 bytes` S3 PDFs) | **`20–35 mins`** | 14-day RDS Continuous WAL PITR + Pre-Migration Snapshots + S3 Versioning |
| **Multi-Hospital Prod (Arch C)** | **`0 seconds` (AZ fail) / `<= 5 min` (PITR)** | **`60–120 seconds`** | Multi-AZ RDS Synchronous Standby + 35-day PITR + Cross-Region Snapshot Copy to `ap-south-2` |

### Off-Box Tamper-Evident Hash Anchoring (`< $0.02/month`)
To prevent even a compromised database superuser (`oncobrief_migrator`) from disabling triggers and rewriting `ledger_entry` or `audit_event` from genesis, an EventBridge nightly rule (`01:30 IST`) invokes `oncobrief-<env>-admin` (`{"action":"anchor-hashes"}`) to:
1. Recompute `verifyLedgerChain` and `audit_event` SHA-256 chains from genesis for each `org_id`.
2. Verify that yesterday's terminal `entry_hash` still matches the row stored in RDS today.
3. Write today's `{ orgId, terminalSeq, terminalHashSha256 }` manifest to S3 with **S3 Object Lock (`COMPLIANCE` mode, 7-year retention)** and emit `HashChainIntegrityFailure = 0` to CloudWatch.
