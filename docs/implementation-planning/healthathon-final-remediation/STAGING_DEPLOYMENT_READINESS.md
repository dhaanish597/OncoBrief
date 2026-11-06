# OncoBrief — Staging Deployment Readiness Report

- **Document Version:** 1.0 (Phase 07C Release Candidate Hardening)
- **Date:** 2026-11-03
- **Auditor:** Principal DevOps Engineer & Cloud Infrastructure Architect
- **Deployment Surfaces:** AWS ECS Fargate, CloudFront CDN, RDS PostgreSQL 16, S3 Evidence Storage, Docker

---

## 1. Executive Summary

This report provides the deployment readiness audit for OncoBrief's cloud staging environment.

In accordance with strict safety instructions:
- **Zero billable cloud infrastructure was provisioned or modified without explicit user authorization.**
- **`terraform apply` was not executed.**
- **The expired AWS CLI session was identified and safely handled without exposing secrets.**
- **All local preflight verifications (Docker, database migrations, Next.js build, environment schemas) were confirmed green.**

---

## 2. Infrastructure Architecture & Local Preflight Audit

### 2.1 Defined Infrastructure Architecture
OncoBrief defines an enterprise AWS healthcare deployment topology structured under `infra/`:
1. **Compute:** AWS ECS Fargate running multi-stage Docker container (`Dockerfile`).
2. **Database:** AWS RDS PostgreSQL 16 Multi-AZ with enforced Row-Level Security (`app.org_id` / `app.current_tenant_id`) and TLS 1.3 `verify-full` connection security.
3. **Storage:** AWS S3 buckets for scanned document packets (`LocalFsStorageAdapter` in local mode, `S3StorageAdapter` in cloud mode) with server-side encryption (SSE-KMS) and bucket-level public access blocks.
4. **Edge CDN:** AWS CloudFront distribution providing HTTPS termination, WAF security rules, and CVE-2025-29927 header stripping.
5. **Worker Daemon:** Dedicated ECS task running `apps/worker` for asynchronous OCR ingestion and guideline document vectorization.

### 2.2 Container Build & Environment Preflight
- **Multi-Stage Dockerfile:** Verified at repository root (`./Dockerfile`). Uses non-root `node` user, pinned Alpine Linux base, and multi-stage dependency pruning.
- **Migration Pipeline:** Verified sequential execution of migrations `0001` through `0023_fhir_interoperability.sql` on disposable PostgreSQL instance.
- **Environment Schema:** Validated via `packages/db/src/env.ts` with strict Zod parsing:
  - `DATABASE_URL` (Required)
  - `MIGRATOR_DATABASE_URL` (Required)
  - `SESSION_SECRET` (Required, min 32 chars)
  - `SARVAM_API_KEY` (Optional; system defaults to local fallback when unconfigured)
  - `ABDM_CLIENT_ID` / `ABDM_CLIENT_SECRET` (Optional; system defaults to in-memory Fidelius sandbox)

---

## 3. Staging Execution Status & External Blocker

### 3.1 Authentication Check
- **Command:** `aws sts get-caller-identity`
- **Observed Result:**
  ```
  aws: [ERROR]: Your session has expired. Please reauthenticate using 'aws login'.
  ```
- **Classification:** **`BLOCKED_EXTERNAL_INFRASTRUCTURE`**

### 3.2 Deployed E2E Smoke Tests
The repository includes 5 cloud-deployed smoke tests in `apps/web/e2e/deployed.spec.ts`:
1. `login, workspace and the demo patient load`
2. `a fact carries inspectable provenance`
3. `source inspector draws stored geometry and human verify works`
4. `reconciliation keeps both values for a human`
5. `sources inventory shows documents and duplicate candidates`

**Execution State:** In local test runs, these 5 tests are intentionally and safely skipped via `test.skip(!CODE, 'Set E2E_DEPLOYED_CODE to run this suite against a deployed instance.')`.
They will execute automatically once an authorized, active staging domain is configured.

---

## 4. Staging Activation Checklist (Post-Authorization)

To deploy to AWS staging when authorized:
1. **Authenticate AWS CLI:**
   ```bash
   aws login
   # Or set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
   ```
2. **Validate Caller Identity:**
   ```bash
   aws sts get-caller-identity
   ```
3. **Build & Push Production Image to ECR:**
   ```bash
   aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account_id>.dkr.ecr.ap-south-1.amazonaws.com
   docker build -t oncobrief-web:staging .
   docker tag oncobrief-web:staging <account_id>.dkr.ecr.ap-south-1.amazonaws.com/oncobrief-web:staging
   docker push <account_id>.dkr.ecr.ap-south-1.amazonaws.com/oncobrief-web:staging
   ```
4. **Deploy ECS Service:**
   ```bash
   aws ecs update-service --cluster oncobrief-staging --service oncobrief-web --force-new-deployment
   ```
5. **Run Deployed Smoke Tests:**
   ```bash
   E2E_SKIP_SERVER=1 \
   E2E_BASE_URL=https://<staging-cloudfront-domain> \
   E2E_DEPLOYED_CODE=DEMO-ONCO-001 \
   pnpm --filter @oncobrief/web exec playwright test deployed.spec.ts
   ```

---

## 5. Deployment Readiness Verdict

- **Local Preflight Architecture:** **VERIFIED** (Docker, Next.js build, migrations, schema valid).
- **Cloud Infrastructure State:** **BLOCKED_EXTERNAL** (AWS session expired; pending user authorization for billable provisioning).
- **Demo Readiness:** **UNBLOCKED** (Local and sandbox environments are 100% self-contained and verified).
