# AGENT 11 — DEPLOYMENT MIGRATION AND READINESS AUDIT

> **Superseding live evidence:** November 5 AWS inspection found no running OncoBrief stack; snapshots, buckets and selected identity resources remain. The “active” inventory below is not current. See [the live redeployment audit](21-redeployment-audit-and-plan-2026-11-05.md).

**Document ID:** `11-deployment-readiness-audit.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Role:** Agent 11 — Deployment Migration and Compatibility Specialist  

---

## 1. Executive Readiness Verdict (`[VERIFIED]`)

**Current Status: NOT DEPLOYABLE TO CLINICAL PRODUCTION WITHOUT TARGETED REMEDIATION (4 P0 Blockers, 4 P1 Blockers).**

While the local codebase passes **1,202 unit/PostgreSQL integration tests and 102 Playwright E2E checks** (`1,304/1,304` checks) and has an active AWS stack in `ap-south-1` (Account `375546530800`), significant **code-to-cloud drift** exists between the repository HEAD (`23` migrations, V4/Wave 2 features, Patient Portal, FHIR R4) and the deployed `oncobrief-dev` infrastructure (`7`–`19` bundled migrations, V1/V2 seed, missing web env vars, and dual S3 upload triggers).

---

## 2. Inventory of Existing Deployed AWS Resources (`ap-south-1`, Account `375546530800`) (`[VERIFIED]`)

| Resource Layer | Deployed Identifier | Current State (`docs/aws-deployment-status.md` & `AWS_READINESS_AUDIT.md`) | Reuse vs. Refactor Action |
| :--- | :--- | :--- | :--- |
| **Terraform State S3** | `s3://oncobrief-tfstate-375546530800` | Active with versioning, SSE, and native S3 lockfile (`use_lockfile = true`) | **Reuse directly** |
| **Documents S3 Bucket** | `s3://oncobrief-documents-dev` | Active, SSE-KMS (`bb27fe5e-...`), public access blocked; `s3:ObjectCreated:*` triggers SQS on `org/` | **Reuse** (fix `filter_prefix` / idempotency guard) |
| **RDS PostgreSQL 16** | `oncobrief-dev-db.cvcoks6qgrox.ap-south-1.rds.amazonaws.com` | Active (`db.t4g.micro`, private subnet), but schema lags repository (`0020`–`0023` unapplied) | **Reuse & Migrate** (run synced `admin` Lambda `migrate`) |
| **ECS Fargate + ALB** | `oncobrief-dev-web` | Running older image (`512` CPU / `1024` MiB `x86_64`), missing V4 AI/ABDM env vars | **Update in place** (`ARM64`, full env vars, `/api/v1/health`) |
| **CloudFront CDN** | `d1be3997j8s23s.cloudfront.net` *(older `dsc1vmsr4q09g` deleted)* | Active HTTPS edge, but uses `http-only` (`:80`) to ALB | **Harden in place** (CloudFront VPC Origin / HTTPS origin + `/_next/static/*` cache) |
| **Worker Lambdas** | `oncobrief-dev-document-ingest`, `oncobrief-dev-ocr-result`, `oncobrief-dev-admin` | Running `nodejs20.x`; `admin` bundle only has migrations `0001`–`0019` | **Rebuild & Update** (`nodejs22.x`, `arm64`, all `23` migrations) |
| **NAT Gateway** | `oncobrief-dev-nat` | Active, burning **`$44.53/month`** fixed cost | **Destroy / Replace** (`enable_nat_gateway = false`) |
| **API Gateway & Cognito** | `aqcq720fme` (`backend_uri = ""`) & `ap-south-1_Ypc1KbaV7` | Unwired proxy target; app uses PostgreSQL `ob_session` auth | **Remove `api_gateway`**; make `cognito` optional (`count = 0`) |

---

## 3. Complete Readiness Checklist & Blocker Classification (`P0` – `P3`)

### 3.1 Build, Database, Application & Security Readiness Matrix

| Area | Check Item | Verified Status | Evidence & File Reference |
| :--- | :--- | :---: | :--- |
| **Build** | Node.js `>=22` & `pnpm@9.15.4` lockfile integrity | **PASS** | `package.json:5-8`, `pnpm-lock.yaml` (`[VERIFIED]`) |
| **Build** | Local Mac Docker & Terraform CLI installed | **FAIL (`P0`)** | Missing `terraform` and `docker`/`colima` in `docs/AWS_READINESS_AUDIT.md` (`[VERIFIED]`) |
| **Database** | All 23 migrations (`0001`–`0023`) bundled into `admin` Lambda | **FAIL (`P0`)** | `apps/worker/src/bundled-migrations.ts` stops at `0019`, omitting `0020`–`0023` (`[VERIFIED]`) |
| **Database** | Forced RLS (`63` tables) & transaction-local `withTenant` | **PASS (in `0020`)** | Requires applying `0020_remediation_rls_and_governance.sql` on RDS (`[VERIFIED]`) |
| **Database** | Verified RDS TLS (`sslmode=verify-full`) | **FAIL (`P0`)** | `admin.ts:74, 294` uses `rejectUnauthorized: false`; `main.tf:115` uses `sslmode=require` (`[VERIFIED]`) |
| **App** | Synchronous Web Upload vs. S3 Event Notification isolation | **FAIL (`P0`)** | `ingestDocument` writes to `org/` in S3, triggering duplicate SQS `document-ingest` job (`[VERIFIED]`) |
| **App** | ECS Web Container Environment Variables (`infra/environments/dev/main.tf:190-207`) | **FAIL (`P1`)** | Missing `OCR_DRIVER`, `SARVAM_API_KEY`, `BEDROCK_MODEL_ID`, `ABDM_*` on `module.web` (`[VERIFIED]`) |
| **App** | Textract OCR Cost Configuration (`packages/adapters/src/textract-ocr.ts:126`) | **FAIL (`P1`)** | Uses `FeatureTypes: ['TABLES', 'FORMS']` (`$0.065/p`) instead of `DetectDocumentText` (`$0.0015/p`) (`[VERIFIED]`) |
| **Security** | Non-root AWS CLI credentials & `ap-south-1` default region | **FAIL (`P0`)** | Root session + 2 active root keys + `us-east-1` default in `~/.aws/config` (`[VERIFIED]`) |
| **Security** | ECS Task Role instead of static IAM user `oncobrief-dev-web-storage` | **FAIL (`P0`)** | `infra/modules/web/main.tf:107` creates static IAM keys; `aws_ecs_task_definition.web` lacks `task_role_arn` (`[VERIFIED]`) |
| **Security** | End-to-End TLS between CloudFront and ALB | **FAIL (`P0`)** | `infra/modules/web/main.tf:307` defaults to `http-only` on port 80 (`[VERIFIED]`) |

### 3.2 Zero-Data-Loss Migration Plan for `oncobrief-dev-db`
1. Create a manual RDS snapshot (`oncobrief-dev-db-pre-v5-migration`) and wait for `available`.
2. Regenerate `apps/worker/src/bundled-migrations.ts` with all 23 SQL files (`0001`–`0023`) and build `infra/build/worker/admin.js`.
3. Update `oncobrief-dev-admin` Lambda and invoke `{"action":"migrate"}` (idempotent `schema_migration` tracking applies `0008`–`0023` in transaction order without dropping or truncating any existing rows).
4. Run `{"action":"probe"}` on `oncobrief-dev-admin` to confirm `app_role` returns `0` rows without context and `>0` rows with `app.org_id` set.
