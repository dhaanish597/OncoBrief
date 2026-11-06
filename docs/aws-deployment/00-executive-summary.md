# EXECUTIVE SUMMARY — ONCOBRIEF AWS PRODUCTION ARCHITECTURE & DEPLOYMENT PLAN

> **Live-state correction, November 5:** the main stack is deleted, retained state is stale, and current lint fails. Provisioned-resource and passing-test claims below are historical assumptions. Use [the live redeployment audit](21-redeployment-audit-and-plan-2026-11-05.md) for the current inventory and approval scope.

**Document ID:** `00-executive-summary.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Target AWS Region:** `ap-south-1` (Asia Pacific — Mumbai)  
**Primary Recommended Architecture:** **Architecture B — Cost-Optimized Single-Hospital Production Pilot**  

---

## 1. Current Application Architecture (`Verified`)

OncoBrief is a production-grade TypeScript monorepo (`pnpm@9.15.4`, Node.js `>=22`) across 8 workspaces (`@oncobrief/domain`, `@oncobrief/ports`, `@oncobrief/adapters`, `@oncobrief/db`, `@oncobrief/web`, `@oncobrief/worker`, `apps/extension`, `apps/mobile`) backed by **PostgreSQL 16** (`23` sequential SQL migrations, `66` RLS-enabled tables, `63` `FORCE ROW LEVEL SECURITY` tenant tables):
- **Core Clinical Safety Engine:** Implements an append-only Evidence Ledger (`evidence_fact`, `ledger_entry`, `audit_event`, `text_span`) protected by `BEFORE UPDATE OR DELETE` immutability triggers (`oncobrief_forbid_mutation`), dual per-organization SHA-256 hash chains, a **Two-Stage Deterministic Provenance & Entailment Gate** (`validateSpans` + `validateCandidateProvenance`), date-aware conflict detection (`0%` serial-lab false conflicts), a 2-click atomic batch verifier, a `9.49 ms` Smart OPD slot backfill optimizer, a 4-format Clinician Productivity Studio, 11-locale caregiver voice continuity (`Sarvam Bulbul v3` + offline WAV fallback), and NRCeS ABDM v6.5.0 / HL7 mCODE STU4 FHIR R4 interoperability with real `Curve25519` + `AES-256-GCM` Fidelius encryption.
- **Test & Verification Baseline:** **1,202 unit and PostgreSQL 16 integration tests + 102 Playwright E2E checks (`1,304/1,304` checks)** pass locally with **0 clinical boundary violations** (`pnpm boundary:check`).

---

## 2. Deployment Readiness & Critical Code-to-Cloud Drift (`Verified`)

While an AWS stack (`oncobrief-dev` in `ap-south-1`, Account `375546530800`, CloudFront `https://d1be3997j8s23s.cloudfront.net`) is already provisioned via Terraform (`infra/`), **4 P0 blockers and 4 P1 blockers** stand between the current deployment and production readiness:
1. **`P0-1` — Worker Migration Bundle Drift (`apps/worker/src/bundled-migrations.ts`):** `packages/db/migrations/` has **23 migrations (`0001`–`0023`)**, but `bundled-migrations.ts` stops at `0019`—leaving AWS RDS without `0020_remediation_rls_and_governance.sql` (`FORCE RLS` on 14 Milestone A/B tables), Wave 2 (`0021`), Patient Portal (`0022`), and FHIR R4 (`0023`).
2. **`P0-2` — Dual-Pipeline S3 Upload Collision:** Synchronous web uploads (`ingestDocument`) write to `s3://.../org/` and simultaneously trigger `aws_s3_bucket_notification.documents` -> SQS `document-ingest` -> Lambda worker, causing race conditions.
3. **`P0-3` — Transit & Credential Hardening:** CloudFront-to-ALB defaults to plaintext `http-only` (`infra/modules/web/main.tf:307`), `admin.ts:74` uses `ssl: { rejectUnauthorized: false }`, `main.tf:115` injects a hardcoded `oncobrief_app` password, `web/main.tf:107` uses static IAM user keys instead of an ECS Task Role, and the local AWS CLI has active root access keys.
4. **`P1-1` — 43.3× Textract Billing Trap & Idle NAT Gateway Waste:** `packages/adapters/src/textract-ocr.ts:126` calls `AnalyzeDocument` with `FeatureTypes: ['TABLES', 'FORMS']` (**`$0.065/page`**) even though `normalizeTextractBlocks` (`line 185`) discards all `TABLE` and `KEY_VALUE_SET` blocks and only reads `LINE` blocks (`DetectDocumentText` costs **`$0.0015/page`**—**43.3× cheaper**!), while `infra/modules/vpc/main.tf` runs a 24×7 Managed NAT Gateway burning **`$44.53/month`** at idle.

---

## 3. Recommended AWS Architecture (`Architecture B` in `ap-south-1` Mumbai)

We select **Architecture B (Cost-Optimized Single-Hospital Production Pilot)** in **`ap-south-1` (Mumbai)**:
- **Edge & Origin:** Amazon CloudFront (TLS 1.3, `/_next/static/*` cached, `Cache-Control: private, no-store` on all dynamic/API routes) -> **CloudFront VPC Origin (`$0.00/mo`)** -> **Internal ALB (`internal = true`, `$17.45/mo`, `0` public IPv4s, HTTPS `:443`)**.
- **Web Compute (`apps/web`):** **ECS Fargate Graviton2 (`ARM64`, `0.5 vCPU / 1 GB RAM`, `$14.42/mo`)** in a public-egress subnet (`assign_public_ip = true` for direct IGW egress, with Security Group blocking 100% of direct internet ingress) + **Free S3 Gateway Endpoint (`$0.00/mo`)** — **eliminating the `$44.53/mo` Managed NAT Gateway**.
- **Worker Compute (`apps/worker`):** **Amazon SQS** (`document-ingest`, `ocr-result` + DLQs, `visibility_timeout = 900s`) + **AWS Lambda `ARM64` (`nodejs22.x`, `maximum_concurrency = 5`, `DB_POOL_MAX = 2`)** at **`$0.00/mo` idle** (`$0.62/mo` at 2,500 docs/mo).
- **Database:** Private **RDS PostgreSQL 16 `db.t4g.small` Single-AZ** (`2 GiB RAM`, `30 GB gp3`, 14-day PITR `RPO <= 5 min`, `sslmode=verify-full`, **`$34.59/mo`**; or `db.t4g.micro` at **`$17.95/mo`** for 25-user shadow pilots).
- **Storage & Integrity:** Private **Amazon S3** (`SSE-KMS` with Bucket Keys, Versioning, and **S3 Object Lock `COMPLIANCE` mode** for nightly terminal SHA-256 hash-chain anchors).

---

## 4. Estimated Monthly Costs Across All 5 Scenarios (`1 USD = ₹84.50 INR`)

| Workload Scenario | Architecture Tier | Monthly Idle Floor | Base Monthly Total (USD) | Base Monthly Total (INR Ex-GST) | Base Incl. 18% GST (INR) | Cost / Processed Document |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **1. Minimal Demo** (5–10 users, 50 docs/mo) | **Arch A** (`micro` + `0.25 vCPU` ARM64, No ALB/NAT) | `$30.61/mo` | **`$32.17/mo`** | **`₹2,718/mo`** | `₹3,208/mo` | `$0.643` (`₹54.37`) |
| **2. Small Hospital Pilot** (25 users, 500 docs/mo) | **Arch B-Micro** (`db.t4g.micro` + `0.5 vCPU` ARM64) | `$55.80/mo` | **`$71.10/mo`** | **`₹6,008/mo`** | `₹7,089/mo` | `$0.142` (`₹12.02`) |
| **3. Main Target: 100-User Hospital** (2,500 docs / 10k pages/mo) | **Arch B-Small** (`db.t4g.small` + `0.5 vCPU` ARM64) | **`$72.44/mo`** | **`$149.18/mo`** *(**$119.61** w/ TTS cache)* | **`₹12,606/mo`** *(**₹10,107** w/ cache)* | **`₹14,875/mo`** | **`$0.0597` (`₹5.04`)** |
| **4. Five Hospitals** (500 users, 12,500 docs/mo) | **Arch C** (`db.t4g.medium` Multi-AZ + `2×1 vCPU` ARM64) | `$236.22/mo` | **`$619.07/mo`** (`$123.81/hosp`) | **`₹52,311/mo`** (`₹10,462/hosp`) | `₹61,727/mo` | `$0.0495` (`₹4.18`) |
| **5. Twenty Hospitals** (2,000 users, 50,000 docs/mo) | **Arch C-Scale** (`db.m7g.large` Multi-AZ + `4×1 vCPU` ARM64) | `$621.74/mo` | **`$2,151.38/mo`** (`$107.57/hosp`) | **`₹1,81,792/mo`** (`₹9,090/hosp`) | `₹2,14,514/mo` | `$0.0430` (`₹3.64`) |
