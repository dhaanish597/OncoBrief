# PHASE 8 — STEP-BY-STEP EXECUTION-READY IMPLEMENTATION PLAN

**Document ID:** `15-implementation-plan.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Target Architecture:** Architecture B (`ap-south-1` Mumbai)  

---

## Stage 1 — Preflight & AWS Account Hardening (`Tasks 1.1 – 1.3`)

### Task `IMPL-1.1` — Remediate Local Toolchain & AWS CLI Region (`P0`)
- **Objective:** Install missing local build/IaC binaries on the operator MacBook and fix the default AWS region mismatch (`us-east-1` -> `ap-south-1`).
- **Existing Files to Inspect:** `docs/AWS_READINESS_AUDIT.md`, `infra/environments/dev/versions.tf`.
- **Files to Create / Modify:** `~/.zprofile`, `~/.aws/config` (local operator environment; no repo mutation).
- **AWS Services Involved:** AWS STS, IAM.
- **Implementation Procedure:**
  1. Ensure Homebrew is in `PATH`: `eval "$(/opt/homebrew/bin/brew shellenv)"`.
  2. Install Terraform (`>= 1.10.5`) and Colima/Docker: `brew install terraform colima docker docker-compose aws-session-manager-plugin`.
  3. Set default region to Mumbai: `aws configure set default.region ap-south-1`.
- **Verification Commands:**
  ```bash
  terraform -version          # Expected: Terraform v1.10.x
  docker --version            # Expected: Docker version 27.x+
  aws configure get region    # Expected: ap-south-1
  ```
- **Failure Modes & Rollback:** If Colima VM fails to start on Apple Silicon, run `colima start --arch aarch64 --cpu 4 --memory 8`.
- **Cost Implications:** `$0.00`.

### Task `IMPL-1.2` — Replace Root Credentials with Least-Privilege IAM Role & Enable Account Guardrails (`P0`)
- **Objective:** Stop using `arn:aws:iam::375546530800:root`, delete the 2 active root access keys, enable account-level S3 Block Public Access, and create a `$25/mo` dev / `$180/mo` pilot AWS Budget alert.
- **Existing Files to Inspect:** `docs/AWS_READINESS_AUDIT.md`.
- **AWS Services Involved:** AWS IAM, S3 Control, AWS Budgets.
- **Implementation Procedure:**
  1. Create an admin/developer IAM role or configure IAM Identity Center in Account `375546530800`, then delete both root access keys in the AWS Console (`IAM -> Security credentials`).
  2. Enable account-level S3 Block Public Access:
     ```bash
     aws s3control put-public-access-block --account-id 375546530800 \
       --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
     ```
- **Acceptance Criteria:** `aws sts get-caller-identity` returns an assumed-role or IAM user ARN (never `:root`), and `aws s3control get-public-access-block` returns all `true`.
- **Cost Implications:** `$0.00` (first 2 AWS Budgets are free).

---

## Stage 2 — Prepare Application Codebase (`Tasks 2.1 – 2.6`)

### Task `IMPL-2.1` — Auto-Sync All 23 SQL Migrations (`0001`–`0023`) into Worker Bundle (`P0`)
- **Objective:** Fix `apps/worker/src/bundled-migrations.ts` so `oncobrief-<env>-admin` Lambda bundles all 23 SQL migrations (`0001_bootstrap.sql` through `0023_fhir_interoperability.sql`) and `rds-global-bundle.pem`.
- **Existing Files to Inspect:** `apps/worker/src/bundled-migrations.ts`, `apps/worker/scripts/build.mjs`, `packages/db/migrations/0001_bootstrap.sql` .. `0023_fhir_interoperability.sql`.
- **Files to Modify:** `apps/worker/scripts/build.mjs`, `apps/worker/src/bundled-migrations.ts`, `apps/worker/src/admin.ts`.
- **Implementation Procedure:**
  1. Update `apps/worker/scripts/build.mjs` to scan `packages/db/migrations/*.sql` alphabetically, write `apps/worker/src/bundled-migrations.ts` with all 23 imports before calling `esbuild.build()`, set `target: 'node22'`, and copy `packages/db/certs/rds-global-bundle.pem` into `infra/build/worker/rds-global-bundle.pem`.
  2. In `apps/worker/src/admin.ts:74, 294`, replace `ssl: { rejectUnauthorized: false }` with `ssl: { rejectUnauthorized: true, ca: readFileSync(resolve(__dirname, 'rds-global-bundle.pem'), 'utf8') }`.
- **Verification Commands:**
  ```bash
  pnpm worker:build
  grep -c "0023_fhir_interoperability.sql" apps/worker/src/bundled-migrations.ts  # Expected: 2
  test -f infra/build/worker/rds-global-bundle.pem && echo "CA bundled"
  ```
- **Rollback Procedure:** `git checkout -- apps/worker/scripts/build.mjs apps/worker/src/bundled-migrations.ts apps/worker/src/admin.ts`.
- **Cost Implications:** `$0.00`.

### Task `IMPL-2.2` — Eliminate Dual-Pipeline Upload Collision & Add Idempotency Guard (`P0`)
- **Objective:** Prevent synchronous web uploads (`ingestDocument`) and S3 `ObjectCreated` event notifications (`document-ingest` SQS) from racing on the same S3 object.
- **Existing Files to Inspect:** `packages/db/src/services/documents.ts`, `apps/worker/src/handlers/document-ingest.ts`, `infra/environments/dev/main.tf:239-249`.
- **Files to Modify:** `apps/worker/src/handlers/document-ingest.ts`, `packages/db/src/services/documents.ts`.
- **Implementation Procedure:**
  1. In `apps/worker/src/handlers/document-ingest.ts`, check the document's current `ingest_status` in PostgreSQL before starting OCR: if `ingest_status === 'ready' || ingest_status === 'ocr_running' || ingest_status === 'extracting'`, log `{ event: 'ingest.skipped_already_processed' }` and return cleanly so SQS deletes the duplicate notification message.
  2. When `QUEUE_DRIVER === 'sqs'` in `packages/db/src/services/documents.ts`, have web uploads reserve the document with `ingest_status = 'pending_upload'` and let S3 `ObjectCreated` -> SQS -> Lambda drive asynchronous OCR and extraction.
- **Verification Commands:** `pnpm --filter @oncobrief/worker test && pnpm --filter @oncobrief/db test`.
- **Cost Implications:** Eliminates duplicate Textract and Bedrock API calls (saves 50% on accidentally doubled uploads).

### Task `IMPL-2.3` — Fix Textract 43.3× Billing Trap in `packages/adapters/src/textract-ocr.ts` (`P1`)
- **Objective:** Switch `TextractOcrAdapter` default from `AnalyzeDocument` / `StartDocumentAnalysis` (`FeatureTypes: ['TABLES', 'FORMS']`, **`$0.065/page`**) to `DetectDocumentText` / `StartDocumentTextDetection` (**`$0.0015/page`**) since `normalizeTextractBlocks` (`line 185`) only consumes `LINE` blocks.
- **Existing Files to Inspect:** `packages/adapters/src/textract-ocr.ts:105-165`, `packages/adapters/test/textract-ocr.test.ts`.
- **Files to Modify:** `packages/adapters/src/textract-ocr.ts`, `packages/adapters/test/textract-ocr.test.ts`.
- **Implementation Procedure:**
  1. Add optional config `useTablesAndForms?: boolean` (default `false`) to `TextractConfig`.
  2. When `useTablesAndForms` is `false`, call `DetectDocumentText` (sync) and `StartDocumentTextDetection` / `GetDocumentTextDetection` (async) instead of `AnalyzeDocument` / `StartDocumentAnalysis`.
- **Verification Commands:** `pnpm --filter @oncobrief/adapters test`.
- **Cost Implications:** Reduces AWS Textract cost by **97.7%** (**saves $508/month** at Scenario 3 volume).

### Task `IMPL-2.4` — Support ECS Task Role Credentials in `packages/adapters/src/aws-sigv4.ts` & Guard `.env.example` (`P0`)
- **Objective:** Allow ECS Fargate tasks to sign S3, SQS, Textract, and Bedrock requests using short-lived IAM Task Role credentials (`AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`) so static `aws_iam_user.web_storage` keys can be removed, and prevent `packages/db/src/env.ts` from loading `.env.example` in production.
- **Existing Files to Inspect:** `packages/adapters/src/aws-sigv4.ts`, `packages/db/src/env.ts:21-25`, `packages/db/src/container.ts`.
- **Files to Modify:** `packages/adapters/src/aws-sigv4.ts`, `packages/db/src/env.ts`, `packages/db/src/container.ts`.
- **Implementation Procedure:**
  1. In `packages/db/src/env.ts:23`, change `else if (existsSync(resolve(repoRoot, '.env.example')))` to `else if (process.env.NODE_ENV !== 'production' && existsSync(resolve(repoRoot, '.env.example')))`.
  2. In `packages/db/src/client.ts:171`, make pool size configurable via `max: Number(process.env.DB_POOL_MAX ?? 8)`.
  3. Pass `sessionToken: env.s3.sessionToken` into `S3StorageAdapter` in `packages/db/src/container.ts` and add a cached credential fetcher for `http://169.254.170.2${process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}` when running on ECS Fargate.
- **Verification Commands:** `pnpm verify`.
- **Cost Implications:** `$0.00`.

### Task `IMPL-2.5` — Add `/api/v1/health` Readiness Endpoint & Restrict Patient Portal CORS (`P0`/`P1`)
- **Objective:** Replace the shallow `GET /login` ALB health check with a database- and migration-aware `GET /api/v1/health` probe, and replace wildcard CORS (`*`) in `apps/web/next.config.ts`.
- **Existing Files to Inspect:** `apps/web/next.config.ts:24-35`, `apps/web/src/middleware.ts`.
- **Files to Create:** `apps/web/src/app/api/v1/health/route.ts`.
- **Files to Modify:** `apps/web/next.config.ts`, `apps/web/src/middleware.ts`.
- **Verification Commands:** `pnpm --filter @oncobrief/web test && pnpm --filter @oncobrief/web build`.

---

## Stage 3 — Refactor Terraform Infrastructure as Code (`Tasks 3.1 – 3.5`)

### Task `IMPL-3.1` — Eliminate NAT Gateway, Remove Unused API Gateway & Enable S3 Bucket Keys (`P0`)
- **Objective:** Cut `$44.53/mo` in idle NAT Gateway charges, remove the unwired API Gateway, and reduce KMS API call costs by 99% via S3 Bucket Keys.
- **Existing Files to Inspect:** `infra/environments/dev/main.tf`, `infra/environments/dev/variables.tf`, `infra/modules/vpc/main.tf`, `infra/modules/s3/main.tf`.
- **Files to Modify:** `infra/environments/dev/variables.tf`, `infra/environments/dev/main.tf`, `infra/modules/s3/main.tf`.
- **Implementation Procedure:**
  1. Set `enable_nat_gateway = false` default in `infra/environments/dev/variables.tf` (or replace with optional `t4g.nano` NAT instance for private Lambdas).
  2. Remove `module "api_gateway"` from `infra/environments/dev/main.tf` and gate `module "cognito"` with `count = var.enable_cognito ? 1 : 0`.
  3. Add `bucket_key_enabled = true` inside `aws_s3_bucket_server_side_encryption_configuration` in `infra/modules/s3/main.tf`.
- **Verification Commands:** `terraform -chdir=infra/environments/dev validate`.
- **Cost Implications:** **Saves `$44.53+/month` (`₹3,763+/month`)** immediately.

### Task `IMPL-3.2` — Upgrade `infra/modules/web` to Graviton2 `ARM64`, Task Role, CloudFront VPC Origin & `/api/v1/health` (`P0`)
- **Objective:** Fix the `http-only` origin transit vulnerability, delete `aws_iam_user.web_storage`, switch Fargate to `ARM64`, add `/_next/static/*` edge caching and `Cache-Control: private, no-store` response headers, and wire all V4 environment variables.
- **Existing Files to Inspect:** `infra/modules/web/main.tf`, `infra/environments/dev/main.tf:150-215`.
- **Files to Modify:** `infra/modules/web/main.tf`, `infra/environments/dev/main.tf`.
- **Implementation Procedure:**
  1. Add `runtime_platform { cpu_architecture = "ARM64", operating_system_family = "LINUX" }` and `task_role_arn = aws_iam_role.web_task.arn` to `aws_ecs_task_definition.web`; delete `aws_iam_user.web_storage` and `aws_iam_access_key.web_storage`.
  2. Change `health_check.path` in `aws_lb_target_group.web` (`line 219`) from `"/login"` to `"/api/v1/health"`.
  3. Configure `aws_cloudfront_vpc_origin` + `internal = true` on `aws_lb.web` (or enforce `https-only` with ACM cert), add `ordered_cache_behavior` for `/_next/static/*`, and attach `aws_cloudfront_response_headers_policy` (`Cache-Control: private, no-store, no-cache, must-revalidate`).
  4. Pass `OCR_DRIVER`, `EXTRACTION_DRIVER`, `BEDROCK_MODEL_ID`, `DB_POOL_MAX = "8"`, and `SARVAM_API_KEY` (via Secrets Manager / SSM `valueFrom`) into the web container definition.

### Task `IMPL-3.3` — Upgrade `infra/modules/lambda` (`nodejs22.x`, `arm64`, Concurrency Cap & Rotated DB Secret) (`P0`)
- **Objective:** Upgrade worker Lambdas from `nodejs20.x` to `nodejs22.x` on `arm64`, cap SQS concurrency at `5`, set `DB_POOL_MAX = "2"`, and replace the hardcoded `oncobrief_app` password in `infra/environments/dev/main.tf:115` with a Secrets Manager secret.
- **Existing Files to Inspect:** `infra/modules/lambda/main.tf`, `infra/modules/rds/main.tf`, `infra/environments/dev/main.tf:85-122`.
- **Files to Modify:** `infra/modules/lambda/main.tf`, `infra/modules/rds/main.tf`, `infra/environments/dev/main.tf`.
- **Implementation Procedure:**
  1. In `infra/modules/lambda/main.tf:64, 96`, set `runtime = "nodejs22.x"`, `architectures = ["arm64"]`, `ocr` `batch_size = 2`, and add `scaling_config { maximum_concurrency = 5 }` to `aws_lambda_event_source_mapping.worker`.
  2. In `infra/modules/sqs/main.tf`, set `visibility_timeout_seconds = 900`.
  3. Generate `random_password.app_db` in `infra/modules/rds/main.tf`, store in Secrets Manager / SSM, and set `?sslmode=verify-full` on `DATABASE_URL`.

---

## Stage 4 to Stage 10 — Database Migration, AI Validation, Web Deploy, CI/CD & Cutover

- **Stage 4 (Database Provisioning & Migration):** Run `aws rds create-db-snapshot`, invoke `oncobrief-<env>-admin` with `{"action":"migrate"}` to apply all 23 migrations (`0001`–`0023`), rotate `oncobrief_app` password, and run `{"action":"probe"}` to verify `FORCE ROW LEVEL SECURITY` (`0` rows without context).
- **Stage 5 (AI & Document Pipeline Verification):** Invoke `oncobrief-<env>-admin` with `{"action":"e2e","orgSlug":"demo"}` and `{"action":"duplicate","orgSlug":"demo"}` to verify S3 upload -> SQS -> Textract/Sarvam -> Bedrock/RuleExtractor -> Stage A/B Provenance Gate -> Evidence Ledger and byte-identical duplicate skipping.
- **Stage 6 (Web Tier Deployment):** Build `Dockerfile` with `docker buildx build --platform linux/arm64`, push to ECR `oncobrief-<env>-web`, update ECS service, and wait for `/api/v1/health?deep=1` -> `HTTP 200`.
- **Stage 7 (CI/CD Automation):** Commit `.github/workflows/ci.yml` (`terraform_version: "1.10.5"`, `pnpm@9.15.4`) and `.github/workflows/deploy.yml` (OIDC role assumption + 9 gates).
- **Stage 8 & 9 (E2E Validation & Load/Cost Verification):** Run `SMOKE_BASE_URL=https://<cloudfront-domain> pnpm smoke:api` (`11/11` checks) and Playwright `deployed.spec.ts` (`5/5` checks), plus k6 clinic-hour concurrency test (`35 VUs`), confirming RDS connections stay `< 45` and AWS Cost Explorer daily run-rate matches `$2.50–$5.00/day`.
- **Stage 10 (Production Cutover Safeguards):** Pre-cutover RDS snapshot -> DNS TTL reduction (`60s`) -> ACM custom domain alias attachment on CloudFront -> Post-release `verifyLedgerChain` and `audit_event` hash-chain check -> Operator sign-off.
