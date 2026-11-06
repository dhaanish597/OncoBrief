# PHASE 5 — FINAL RECOMMENDED AWS ARCHITECTURE (SINGLE SOURCE OF TRUTH)

> **Deployment correction:** this is a target design, not implemented/live infrastructure. Private Lambda egress, origin certificate prerequisites and queue visibility require the corrections in [the live redeployment plan](21-redeployment-audit-and-plan-2026-11-05.md). No NAT-free apply is approved.

**Document ID:** `14-final-aws-architecture.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Selected Architecture:** **Architecture B — Cost-Optimized Single-Hospital Production Pilot (with Seamless Promotion to Architecture C)**  
**Selected AWS Region:** **`ap-south-1` (Asia Pacific — Mumbai)**  

---

## 1. Authoritative Architecture Summary Table

| Layer | Chosen AWS Service (`ap-south-1` Mumbai) | Exact Configuration & Sizing | Monthly Fixed Cost (USD / INR @ ₹84.50) | Why This Beats Alternatives for OncoBrief |
| :--- | :--- | :--- | :---: | :--- |
| **1. Edge & CDN** | **Amazon CloudFront** + **CloudFront VPC Origin** | `PriceClass_200`, TLS 1.3, `Managed-CachingDisabled` + `Cache-Control: private, no-store` on dynamic routes; `Managed-CachingOptimized` on `/_next/static/*`; `aws_cloudfront_vpc_origin` to Internal ALB | **`$0.00/mo`** (1 TB & 10M reqs free) | Eliminates public IPv4s on the ALB (`-$7.30/mo`), enforces edge TLS, offloads static JS/CSS, and guarantees zero edge caching of PHI. |
| **2. Load Balancing** | **Internal Application Load Balancer (ALB)** | `internal = true` in private/isolated subnets (`ap-south-1a/b`), HTTPS `:443` listener (`ELBSecurityPolicy-TLS13-1-2-2021-06`), `/api/v1/health` probe (`30s` interval) | **`$17.45/mo`** (`₹1,475`) + `~$1.20` LCU | Enables zero-downtime ECS rolling deployments, automatic circuit-breaker rollbacks, and multi-task horizontal scaling without public internet exposure. |
| **3. Web Application (`apps/web`)** | **AWS ECS Fargate Graviton2 (`ARM64`)** | `cpu = 512` (`0.5 vCPU`), `memory = 1024` (`1 GiB`), `runtime_platform = { cpu_architecture = "ARM64" }`, `desired_count = 1` (autoscales `1 -> 3` at `60%` CPU), `DB_POOL_MAX = 8` | **`$14.42/mo`** (`₹1,218`) | 20% cheaper than `x86_64`; runs Next.js 15 SSR, Server Actions, `@node-rs/argon2`, and `pdf-lib` natively with zero cold starts. |
| **4. VPC & NAT-Free Egress** | **Amazon VPC** (`10.60.0.0/16`, 2 AZs) + **Free S3 Gateway Endpoint** | `enable_nat_gateway = false`; RDS in private subnets; Fargate in public-egress subnet (`assign_public_ip = true`, `$3.65/mo` IPv4) with Security Group blocking **100% of inbound internet traffic** (accepting `:3000` strictly from Internal ALB SG) | **`$3.65/mo`** (`₹308`) *(Saves `$40.88/mo` NAT GW!)* | Provides full outbound HTTPS access to Bedrock, Textract, Sarvam AI, and ABDM over the free Internet Gateway while keeping Fargate and RDS completely unreachable from the public internet. |
| **5. Async Ingestion Workers (`apps/worker`)** | **Amazon SQS** + **AWS Lambda Graviton2 (`ARM64`)** | Queues: `document-ingest`, `ocr-result` + 2 DLQs (`visibility_timeout = 900s`, `maxReceiveCount = 3`); Lambdas: `nodejs22.x`, `arm64`, `512 MB`, `timeout = 180s`, `maximum_concurrency = 5`, `DB_POOL_MAX = 2` (or co-located Fargate worker process) | **`$0.00/mo` idle** (`$0.62/mo` at 2,500 docs) | Scale-to-zero background OCR and LLM extraction without paying `$15–$40/mo` for idle worker containers or Step Functions. |
| **6. Relational Database & Evidence Ledger** | **Amazon RDS for PostgreSQL 16** (`16.14`) | **`db.t4g.small` Single-AZ** (`2 vCPU, 2 GiB RAM`, `30 GB gp3` encrypted, 14-day PITR, `deletion_protection = true`, `sslmode=verify-full`; `db.t4g.micro` at `$17.95/mo` for 25-user shadow pilots) | **`$34.59/mo`** (`₹2,923`) *(or `$17.95/mo` on `micro`)* | Preserves all 23 migrations, 63 `FORCE ROW LEVEL SECURITY` tables, `oncobrief_forbid_mutation` triggers, and `withTenant` transaction isolation at `<50%` the cost of Aurora Serverless v2. |
| **7. Document & WORM Anchor Storage** | **Amazon S3** + **AWS KMS CMK** | Private bucket (`BlockPublicAccess = true`), `SSE-KMS` with **S3 Bucket Keys enabled** (`99%` KMS call reduction), S3 Versioning, Lifecycle (`Glacier IR` at 180 days), and `audit-anchors/` with **S3 Object Lock (`COMPLIANCE` mode)** | **`$1.55/mo`** (`₹131`) (`$1.00` KMS + `15 GB` S3) | Protects patient PDFs against unauthorized access and accidental deletion while anchoring daily `ledger_entry` and `audit_event` SHA-256 hashes off-box. |
| **8. AI, OCR & Voice** | **Local Multimodal OCR** + **AWS Textract** + **Bedrock** + **Sarvam AI** | Tier 0: `LocalMultimodalOcrAdapter` (`$0`) + `RuleBasedExtractor` (`$0`); Tier 1: Textract `StartDocumentTextDetection` (`$0.0015/p`) + Sarvam Vision (`₹0.50/p`); LLM: Bedrock `Nova Pro` / `Nova Lite` (`Converse` forced tool use); Voice: Sarvam `Bulbul v3` / `Saaras v3` | **`$0.00/mo` idle** (`$72.40/mo` base at 2,500 docs) | Cuts per-document AI/OCR cost by **96%** while enforcing 100% Stage A + Stage B span/value entailment (`validateSpans` + `validateCandidateProvenance`). |
| **9. Secrets & Config** | **AWS Secrets Manager** (RDS Master) + **SSM Parameter Store** | RDS-managed master secret (`$0.40/mo`) + SSM Parameter Store Standard (`SecureString` with KMS for `DATABASE_URL`, `SESSION_COOKIE_SECRET`, `SARVAM_API_KEY` at `$0.00/mo`) | **`$0.40/mo`** (`₹34`) | Eliminates static IAM keys and saves `$0.80–$2.00/mo` on extra Secrets Manager secrets. |
| **10. Observability** | **Amazon CloudWatch** + **Amazon SNS** | 10 Standard Alarms (Web 5xx, Unhealthy Hosts, RDS CPU/Storage/Conns, DLQs, Queue Age, Lambda Errors, Hash-Chain Check), 30-day log retention, SNS email topic | **`$3.30/mo`** (`₹279`) *(or `$0.12/mo` w/ Free Tier)* | 100% India-resident, PHI-redacted operational monitoring with zero third-party SaaS fees. |

---

## 2. Detailed Layer Specifications (5.1 – 5.8)

### 5.1 Application Hosting (`apps/web`)
- **Service:** AWS ECS Fargate (`launch_type = "FARGATE"`, `platform_version = "1.4.0"`).
- **Sizing & Architecture:** `cpu = 512` (`0.5 vCPU`), `memory = 1024` (`1024 MiB`), `cpu_architecture = "ARM64"`, `operating_system_family = "LINUX"`.
- **Task Count & Autoscaling:** `desired_count = 1` (Single-Hospital Pilot baseline), `min_capacity = 1`, `max_capacity = 3` via Application Auto Scaling on `ECSServiceAverageCPUUtilization > 60%` (2-minute evaluation) or `ALBRequestCountPerTarget > 450`.
- **IAM Task Role (`task_role_arn`):** Dedicated `aws_iam_role.web_task` granting least-privilege `s3:GetObject`, `s3:PutObject`, `s3:GetObjectVersion` on `arn:aws:s3:::${bucket_name}/*`, `sqs:SendMessage` on `document-ingest`, `bedrock:InvokeModel` on `ap-south-1` foundation models, and `kms:Decrypt`/`kms:GenerateDataKey` on `aws_kms_key.main.arn`. **Static `aws_iam_user.web_storage` is deleted.**

### 5.2 PostgreSQL 16 Database (`packages/db`)
- **Service:** Amazon RDS for PostgreSQL `16.14` (`db.t4g.small` Single-AZ for 100-user hospital; `db.t4g.micro` Single-AZ for demo/25-user shadow pilot; `db.t4g.medium` Multi-AZ for 5–20 hospitals).
- **Storage:** `30 GB gp3` (`allocated_storage = 30`, `max_allocated_storage = 100`, `storage_encrypted = true` with `aws_kms_key.main`).
- **Connection Pooling & RLS:** Built-in `node-postgres` `Pool` (`DB_POOL_MAX = 8` on web tasks, `DB_POOL_MAX = 2` on worker Lambdas). Every query executes as `oncobrief_app` (`NOSUPERUSER NOBYPASSRLS`) inside `withTenant()` (`BEGIN; SELECT set_config('app.org_id', $1, true); ... COMMIT;`), enforcing `FORCE ROW LEVEL SECURITY` across all 63 tenant tables.
- **TLS Enforcement:** Parameter group sets `rds.force_ssl = 1`; application connects with `?sslmode=verify-full` validated against `packages/db/certs/rds-global-bundle.pem` (`rejectUnauthorized: true`).

### 5.3 File and Document Storage (`Amazon S3`)
- **Object Key Hierarchy:**
  - `org/{org_id}/patient/{patient_id}/document/{document_id}{ext}` — Original uploaded PDFs, images, DICOM files, and FHIR JSON bundles.
  - `org/{org_id}/tts-cache/{locale}/{sha256}.wav` — Cached Sarvam Bulbul v3 TTS audio for approved continuity reminders.
  - `anchors/{YYYY}/{MM}/{DD}/{org_id}.json` — Nightly WORM-locked (`ObjectLockMode = "COMPLIANCE"`, 7-year retention) SHA-256 terminal hash manifests for `ledger_entry` and `audit_event`.
- **Upload & Viewing Flow:**
  - Direct browser-to-S3 presigned `PUT` (`POST /api/v1/patients/[id]/documents/upload-url`, `ttl = 900s`, max `25 MB` `content-length` header) bypasses the Next.js container memory buffer for large scans.
  - Document viewing uses RBAC-verified (`document:read_page`) and consent-revocation-checked (`0010_abdm_revoked_source_access.sql`) short-lived presigned `GET` URLs (`ttl = 300s`).

### 5.4 Background Processing (`SQS` + `Lambda` / Co-Located Worker)
- **Queues:**
  - `oncobrief-<env>-document-ingest` (`visibility_timeout_seconds = 900`, redrive `maxReceiveCount = 3` -> `document-ingest-dlq`).
  - `oncobrief-<env>-ocr-result` (`visibility_timeout_seconds = 900`, redrive `maxReceiveCount = 3` -> `ocr-result-dlq`).
- **Idempotency Guard (P0 Fix):** `aws_s3_bucket_notification.documents` triggers on `s3:ObjectCreated:*` under `filter_prefix = "org/"`. In `handleDocumentIngest` (`apps/worker/src/handlers/document-ingest.ts`), if `document.ingest_status !== 'pending_upload'`, the handler logs `already_ingested_or_in_progress` and returns `true` (acknowledging the SQS message without starting a duplicate OCR job).

### 5.5 AI & OCR Integration (`packages/adapters`)
- **OCR Routing (`OCR_DRIVER=auto`):**
  1. Digital PDFs with native text streams (`>= 50` chars/page), FHIR R4 JSON bundles, and DICOM headers run through `LocalMultimodalOcrAdapter` (`$0.00/page`, `<50 ms`).
  2. Scanned English PDFs run through `TextractOcrAdapter` using `StartDocumentTextDetection` / `DetectDocumentText` (`$0.0015/page`).
  3. Regional Indic-script (`hi-IN`, `ta-IN`, etc.) or degraded handwritten scans run through `SarvamVisionOcrAdapter` (`/doc-ai/v1/job/digitise`, `₹0.50/page`).
- **Fact Extraction & Data Residency:**
  - Tier 0 deterministic `RuleBasedExtractor` extracts structured dates, labs, pathology, ER/PR/HER2, procedures, and ABHA IDs in EN/HI/TA at `$0.00`.
  - Tier 1/2 LLM extraction invokes Amazon Bedrock Converse API with forced tool use (`emit_operational_facts`), using an in-region `ap-south-1` model endpoint (or de-identifying header demographics before calling `apac.amazon.nova-pro-v1:0`), followed unconditionally by Stage A (`validateSpans`) and Stage B (`validateCandidateProvenance`) verification.

### 5.6 Authentication & Authorization
- **Staff Auth:** Maintains existing PostgreSQL `user_session` opaque cookie auth (`ob_session`, `HttpOnly`, `SameSite=Lax`, `Secure`, `@node-rs/argon2` password hashing) + optional TOTP (`user_totp`).
- **Patient Portal Auth (`0022`):** Uses rate-limited OTP challenges (`patient_otp_challenge`) and SHA-256 hashed tokens in `patient_portal_session` (`portal_is_authorized_patient_or_caregiver`).

### 5.7 Networking & Edge Delivery
- **VPC (`10.60.0.0/16`):** 2 public-egress subnets + 2 isolated private subnets across `ap-south-1a` and `ap-south-1b`.
- **Zero NAT Gateway:** `enable_nat_gateway = false`; S3 Gateway Endpoint (`$0.00/mo`) routes all S3 traffic internally; Fargate uses `assign_public_ip = true` with zero inbound internet security group rules.
- **Origin Encryption:** CloudFront VPC Origin (`aws_cloudfront_vpc_origin`) connects to the Internal ALB over HTTPS `:443`.

### 5.8 Monitoring & Reliability
- **Health Probe:** `GET /api/v1/health` checks PostgreSQL connectivity and verifies all 23 migrations (`0001`–`0023`).
- **Alarms & Backups:** 10 CloudWatch Alarms -> SNS email; 14-day RDS Continuous WAL PITR (`RPO <= 5 min`); nightly EventBridge -> Admin Lambda WORM hash-chain anchor in S3 Object Lock.

---

## 3. Architectural Diagrams (`docs/aws-deployment/diagrams/`)

All standalone Mermaid diagrams are saved under `docs/aws-deployment/diagrams/`:
- [`diagrams/architecture.mmd`](file:///Users/dhaanish/Documents/OncoBrief/docs/aws-deployment/diagrams/architecture.mmd) — High-level AWS deployment architecture
- [`diagrams/network.mmd`](file:///Users/dhaanish/Documents/OncoBrief/docs/aws-deployment/diagrams/network.mmd) — Detailed network and trust-boundary architecture
- [`diagrams/document-processing.mmd`](file:///Users/dhaanish/Documents/OncoBrief/docs/aws-deployment/diagrams/document-processing.mmd) — Document-upload and AI/OCR processing sequence
- [`diagrams/security-boundaries.mmd`](file:///Users/dhaanish/Documents/OncoBrief/docs/aws-deployment/diagrams/security-boundaries.mmd) — Authentication, RLS, and patient-data security boundaries
- [`diagrams/cicd.mmd`](file:///Users/dhaanish/Documents/OncoBrief/docs/aws-deployment/diagrams/cicd.mmd) — Zero-downtime GitHub Actions OIDC CI/CD and rollback pipeline
- [`diagrams/scaling.mmd`](file:///Users/dhaanish/Documents/OncoBrief/docs/aws-deployment/diagrams/scaling.mmd) — Database backup/restoration and scaling evolution (1 to 20 hospitals)
