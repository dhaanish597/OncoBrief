# AGENT 5 — HEALTHCARE SECURITY AND COMPLIANCE ASSESSMENT

**Document ID:** `05-healthcare-security-assessment.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Role:** Agent 5 — Healthcare Security and Compliance Architect  

---

## 1. Executive Summary & Epistemic Classification

OncoBrief’s application and database layers implement rigorous healthcare safety and privacy engineering:
- **66 RLS-enabled tables (`63` `FORCE ROW LEVEL SECURITY` tenant tables)** across migrations `0001`–`0023` (`packages/db/migrations/0003_policies_grants.sql`, `0020_remediation_rls_and_governance.sql`, `0022_patient_portal_foundation.sql`, `0023_fhir_interoperability.sql`).
- **Database-level append-only immutability triggers (`oncobrief_forbid_mutation`)** on `ledger_entry`, `audit_event`, and `text_span` (`0008_lock_text_spans.sql`) with per-tenant SHA-256 hash chaining (`packages/domain/src/ledger/hash-chain.ts`).
- **Non-destructive ABDM consent revocation quarantine (`0010_abdm_revoked_source_access.sql`)** using a `RESTRICTIVE` RLS policy (`abdm_source_access`) plus `HTTP 409 Conflict` export blocks (`assertPacketSourcesAccessible`, `assertStudioArtifactSourcesAccessible`).
- **Real Curve25519 ECDH (`X25519`) + HKDF-SHA256 + AES-256-GCM Fidelius encryption** (`packages/adapters/src/abdm-crypto.ts`).

However, our audit of the AWS infrastructure (`infra/`), local environment configuration (`docs/AWS_READINESS_AUDIT.md`), and runtime adapters identified **7 Critical/High P0 deployment blockers** and **6 P1 production launch blockers** that must be remediated before processing real patient data.

---

## 2. Classified Security Findings Matrix (`Critical`, `High`, `Medium`, `Low`)

| ID | Severity | Gate | Subsystem & Exact File Reference | Finding & Vulnerability Mechanism | Status | Required Remediation |
| :--- | :---: | :---: | :--- | :--- | :---: | :--- |
| **`SEC-01`** | **Critical** | **P0** | **AWS Account Identity**<br>`docs/AWS_READINESS_AUDIT.md` (Account `375546530800`) | AWS CLI session is logged in as the **AWS Account Root User** (`arn:aws:iam::375546530800:root`) and **2 active root access keys exist** (CIS AWS Foundations 1.4 violation). | `[VERIFIED]` | Delete both root access keys in AWS IAM Console immediately; enable root MFA; use IAM Identity Center (SSO) for humans and GitHub Actions OIDC for CI/CD. |
| **`SEC-02`** | **Critical** | **P0** | **Database Credentials & Lambda Env**<br>`packages/db/migrations/0001_bootstrap.sql`, `infra/environments/dev/main.tf:115`, `packages/db/src/env.ts:23-44` | `0001_bootstrap.sql` sets password `'oncobrief_app'` for runtime role `oncobrief_app`; `main.tf:115` injects `postgres://oncobrief_app:oncobrief_app@...` in plaintext Lambda env vars; `env.ts:23` falls back to `.env.example` if `.env` is missing. | `[VERIFIED]` | Generate a random 48-char password for `oncobrief_app` in Terraform, store in AWS Secrets Manager / SSM SecureString, rotate via Admin Lambda (`ALTER ROLE`), and disable `.env.example` fallback when `NODE_ENV=production`. |
| **`SEC-03`** | **Critical** | **P0** | **Unencrypted CloudFront-to-ALB Origin Transit**<br>`infra/modules/web/main.tf:278, 307` | When `origin_certificate_arn` is empty (`""`), CloudFront forwards requests to the public ALB over **plaintext `HTTP:80` (`http-only`)** across the public internet. Session cookies (`ob_session`) and uploaded PDFs traverse the CloudFront-to-ALB hop unencrypted. | `[VERIFIED]` | Switch the ALB to `internal = true` and connect via **CloudFront VPC Origins (`aws_cloudfront_vpc_origin`)**, or attach an ACM certificate on ALB `:443` with `origin_protocol_policy = "https-only"` and an `X-Origin-Verify` secret header. |
| **`SEC-04`** | **Critical** | **P0** | **Cross-Border PHI Routing in Bedrock**<br>`packages/adapters/src/bedrock-llm.ts`, `docs/aws-deployment-status.md:72` | `apac.amazon.nova-pro-v1:0` is an APAC Geographic Cross-Region Inference Profile that routes prompts from `ap-south-1` (Mumbai) to **Tokyo, Seoul, Osaka, Singapore, and Sydney**, conflicting with Indian hospital / NCG / ABDM data-localization policies for identifiable PHI. | `[VERIFIED]` | For real patient data in India: (a) use a strictly in-region `ap-south-1` model endpoint (`aws:RequestedRegion = "ap-south-1"` IAM condition), or (b) strip direct patient identifiers (`PatientName`, `MRN`, `ABHA`, `Phone`) before calling `apac.amazon.nova-pro-v1:0`, or (c) use India-resident `Sarvam Vision` + `RuleBasedExtractor`. |
| **`SEC-05`** | **High** | **P0** | **Static IAM User & Missing ECS Task Role**<br>`infra/modules/web/main.tf:92-125, 250` | `infra/modules/web/main.tf` provisions a static IAM user (`aws_iam_user.web_storage`) and long-lived access keys because `aws_ecs_task_definition.web` omits `task_role_arn` and `aws-sigv4.ts` only read static env vars. | `[VERIFIED]` | Attach `task_role_arn` to `aws_ecs_task_definition.web`, teach `packages/adapters/src/aws-sigv4.ts` to resolve ECS container credentials (`AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` including `Token`), and delete `aws_iam_user.web_storage`. |
| **`SEC-06`** | **High** | **P0** | **Disabled RDS TLS Verification in Admin Lambda**<br>`apps/worker/src/admin.ts:74, 294`, `infra/environments/dev/main.tf:115` | While `packages/db/src/client.ts:81-165` supports `sslmode=verify-full` against `rds-global-bundle.pem`, `admin.ts:74, 294` hardcodes `ssl: { rejectUnauthorized: false }` and `main.tf:115` uses `?sslmode=require`. | `[VERIFIED]` | Set `?sslmode=verify-full` in all `DATABASE_URL` definitions, copy `rds-global-bundle.pem` into the worker bundle, and enforce `rejectUnauthorized: true` in `admin.ts`. |
| **`SEC-07`** | **High** | **P0** | **Destructive S3 & RDS Terraform Flags**<br>`infra/environments/dev/main.tf:31`, `infra/modules/rds/main.tf:73-74` | S3 bucket sets `force_destroy = true`, and RDS sets `deletion_protection = false` and `skip_final_snapshot = true`. An accidental `terraform destroy` would permanently erase all patient records. | `[VERIFIED]` | In `pilot` and `prod`, enforce `force_destroy = false`, `deletion_protection = true`, `skip_final_snapshot = false`, and `backup_retention_period >= 14`. |
| **`SEC-08`** | **High** | **P1** | **Wildcard CORS on Patient Portal API**<br>`apps/web/next.config.ts:24-35` | `/api/v1/patient-portal/:path*` sets `Access-Control-Allow-Origin: '*'`, permitting arbitrary cross-origin websites to invoke patient portal endpoints from a browser. | `[VERIFIED]` | Replace `'*'` with `process.env.PATIENT_PORTAL_ALLOWED_ORIGIN` (or same-origin only, since native Android/iOS apps do not use browser CORS). |
| **`SEC-09`** | **High** | **P1** | **Missing CloudTrail & Account S3 Block Public Access**<br>`docs/AWS_READINESS_AUDIT.md` | Account `375546530800` has `0` CloudTrail trails (`trailList: []`), `0` AWS Budgets, and no account-level S3 Block Public Access configuration. | `[VERIFIED]` | Enable account-level S3 Block Public Access, create a multi-region CloudTrail trail with log file validation, and configure AWS Budgets (`$25` dev / `$180` pilot). |
| **`SEC-10`** | **Medium** | **P1** | **Unredacted Exception Logging in Web Routes**<br>`apps/web/src/app/api/v1/**/route.ts` | While `apps/worker/src/logger.ts` and `packages/db/src/services/audit.ts` redact 18+ PHI keys, Next.js route handlers do not share `JsonLogger` and can emit raw `Error` objects to CloudWatch Logs. | `[VERIFIED]` | Share `JsonLogger` across `apps/web` and `apps/worker` and enforce ESLint `no-console` in `apps/web/src/app/api/`. |
| **`SEC-11`** | **Medium** | **P1** | **Presigned URL TTL & Upload Size Caps**<br>`packages/adapters/src/s3-storage.ts`, `apps/web/src/app/api/v1/patients/[id]/documents/upload-url/route.ts` | Ensure S3 presigned `GET` URLs expire in `<= 300s` (5 minutes), presigned `PUT` URLs enforce `content-length` (`<= 25 MB`), and `Cache-Control: private, no-store` is set on all CloudFront dynamic responses. | `[VERIFIED]` | Cap `presignGet` TTL to `60–300s` and attach a CloudFront Response Headers Policy setting `Cache-Control: private, no-store, no-cache, must-revalidate`. |
| **`SEC-12`** | **Medium** | **P2** | **Off-Box WORM Anchoring for Hash Chains**<br>`packages/domain/src/ledger/hash-chain.ts` | A compromised database superuser (`oncobrief_migrator`) could disable triggers and rewrite `ledger_entry` + `audit_event` from genesis unless terminal hashes are anchored outside RDS. | `[RECOMMENDED]` | Run a nightly EventBridge -> Admin Lambda job that signs each tenant's terminal SHA-256 hash with KMS and writes it to an S3 Object Lock (`COMPLIANCE` mode) prefix. |

---

## 3. Indian Healthcare Regulatory & Data Residency Assessment (`[VERIFIED]`)

### 3.1 India Digital Personal Data Protection (DPDP) Act 2023
- **Roles:** The deploying hospital / cancer centre is the **Data Fiduciary**; OncoBrief (and AWS India) operates as a **Data Processor** under a binding Section 8(2) Data Processing Agreement (DPA).
- **Technical Controls Already Implemented in Codebase (`[VERIFIED]`):**
  - **Consent Provenance:** `caregiver_contact` (`0011`, `0015`) and `abdm_consent_artifact` (`0009`) record explicit timestamped consent grants.
  - **Right to Withdraw Consent (`Section 6(4)`):** `revokeCaregiverConsent` (`packages/db/src/services/caregivers.ts`) immediately halts outbox dispatches, and `0010_abdm_revoked_source_access.sql` quarantines withdrawn ABDM documents via `RESTRICTIVE` RLS while blocking Packet/Studio/TTS exports with `HTTP 409 Conflict`.
  - **Breach & Audit Readiness (`Section 8(5)–(6)`):** Every read, verification, conflict resolution, export, and denied access attempt is logged in `audit_event` with 18-key PHI metadata redaction (`packages/db/src/services/audit.ts`).

### 3.2 Ayushman Bharat Digital Mission (ABDM) M1/M2/M3 & NHA WASA Requirements
- **Implemented Today (`[VERIFIED]`):** NRCeS ABDM v6.5.0 FHIR R4 bundle mapping (`packages/domain/src/fhir/abdm-bundle-mapper.ts`), HL7 mCODE STU4 mapping (`mcode-mapper.ts`), and Fidelius `Curve25519` ECDH + `HKDF-SHA256` + `AES-256-GCM` encryption (`packages/adapters/src/abdm-crypto.ts`).
- **Required Before Switching `ABDM_DRIVER=simulated` to Production (`[VERIFIED]`):**
  1. Complete NHA ABDM HIE-CM V3 Sandbox functional certification.
  2. Obtain a **Safe-to-Host Web Application Security Assessment (WASA) certificate** from a **CERT-In empaneled auditor**.
  3. Enforce inbound NHA Gateway RS256 JWT signature verification on `/api/v1/abdm/*` webhook callbacks.
