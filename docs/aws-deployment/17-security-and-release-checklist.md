# PHASE 9 — AUTOMATED TESTING MATRIX, SECURITY & RELEASE CHECKLIST

**Document ID:** `17-security-and-release-checklist.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  

---

## 1. Mandatory 22-Gate Automated Testing Matrix

A deployment must **never** be marked production-ready merely because `next build` succeeds. All 22 testing and verification gates below must meet their explicit pass criteria:

| Gate # | Test Category | Command / Verification Suite in Repository | Explicit Pass / Fail Criteria | Current Status |
| :---: | :--- | :--- | :--- | :---: |
| **1** | **Unit Tests (Domain & Adapters)** | `pnpm --filter @oncobrief/domain test && pnpm --filter @oncobrief/adapters test` | `100%` pass (`415+` domain, `86+` adapter tests; `0` skipped/failed) | **PASS (`[VERIFIED]`)** |
| **2** | **Database Integration Tests** | `pnpm --filter @oncobrief/db test` | `100%` pass (`183+` PostgreSQL 16 integration tests) | **PASS (`[VERIFIED]`)** |
| **3** | **Database Migration Reproducibility** | `pnpm db:migrate` + `admin` Lambda `{"action":"migrate"}` | All **23 migrations (`0001`–`0023`)** apply cleanly from empty DB and idempotently on existing DB | **Requires `IMPL-2.1` Sync** |
| **4** | **PostgreSQL Forced RLS Tests** | `packages/db/test/security.test.ts` + `/api/v1/health?deep=1` | `relforcerowsecurity = true` on `>= 63` tenant tables; `0` rows returned when `app.org_id` is unset | **PASS (`[VERIFIED]`)** |
| **5** | **Authentication & Session Tests** | `apps/web/src/lib/auth.test.ts` + `pnpm smoke:api` | Valid `ob_session` / Cognito JWT -> `200`; missing/forged token -> `401`; `x-middleware-subrequest` stripped | **PASS (`[VERIFIED]`)** |
| **6** | **Cross-Tenant Security Tests** | `packages/db/test/security.test.ts` (`rci` vs `northgate` orgs) | Tenant A user reading/mutating Tenant B patient, document, fact, packet, or Studio artifact returns `0` rows / `404` | **PASS (`[VERIFIED]`)** |
| **7** | **Document Upload & Presign Tests** | `POST /api/v1/patients/[id]/documents/upload-url` + `demo-flow.spec.ts` | Rejects unsupported MIME or `>25 MB` (`400`/`415`); mints `900s` KMS-encrypted S3 PUT URL; no dual-pipeline collision | **Requires `IMPL-2.2`** |
| **8** | **OCR Accuracy & Fallback Tests** | `packages/adapters/test/ocr-correctness.test.ts` & `multimodal-intake.test.ts` | Preserves tabular reading order (`|y1-y2| < 0.012`), splits `>10p` PDFs via `pdf-lib`, rejects `partially_completed` jobs | **PASS (`55/55` `[VERIFIED]`)** |
| **9** | **Bedrock Integration Tests** | `packages/adapters/test/bedrock-llm.test.ts` + Admin Lambda `{"action":"e2e"}` | Converse API forced tool `emit_operational_facts` returns valid `FactValue` schema; rejects unanchored span IDs | **PASS (`[VERIFIED]`)** |
| **10** | **Sarvam AI (OCR/STT/TTS) Tests** | `apps/web/src/lib/phase5-continuity-voice.test.ts` | Normalizes all 11 Indian locales (`en-IN`..`od-IN`), strips multi-chunk 44-byte WAV headers, falls back cleanly when offline | **PASS (`46/46` `[VERIFIED]`)** |
| **11** | **Two-Stage Evidence Provenance Gate** | `packages/db/test/two-stage-span-gate.test.ts` (`validateSpans` + `validateCandidateProvenance`) | Rejects `100%` (`30/30` adversarial cases) of unanchored quotes, cross-page splices, or numeric/date mismatches | **PASS (`30/30` `[VERIFIED]`)** |
| **12** | **Clinician Approval & RBAC Tests** | `packages/db/test/studio.test.ts` & `batch-verification.test.ts` | `system` actor cannot verify (`transitions.ts:62`); `coordinator` cannot approve Packet/Studio (`403`); revoked source -> `409 Conflict` | **PASS (`[VERIFIED]`)** |
| **13** | **Background Worker Retry & DLQ Tests** | `apps/worker/test/` (`pnpm worker:test`) | Transient error leaves message for SQS redelivery; `receiveCount > 3` routes to DLQ; `ReportBatchItemFailures` enabled | **PASS (`29/29` `[VERIFIED]`)** |
| **14** | **Duplicate-Job & Idempotency Tests** | Admin Lambda `{"action":"duplicate"}` + `packages/domain/test/dedup.test.ts` | Byte-identical upload sets `duplicate_status = 'duplicate_candidate'` and skips paid OCR/LLM calls | **PASS (`[VERIFIED]`)** |
| **15** | **Large Multi-Page PDF Processing** | `packages/adapters/test/ocr-correctness.test.ts` (23-page PDF split `10+10+3`) | Splits without OOM (`1024 MiB` Fargate / `512 MB` Lambda), preserves global page numbers `1..23` | **PASS (`[VERIFIED]`)** |
| **16** | **UI End-to-End Workflows** | `pnpm --filter @oncobrief/web test:e2e` (`independent-judge-journey.spec.ts` + 11 specs) | All 19 demo steps pass end-to-end in Chromium (`51/51` core E2E / `102/102` expanded E2E checks) | **PASS (`[VERIFIED]`)** |
| **17** | **Mobile & Accessibility (`375px`)** | `apps/web/e2e/phase4-ux-accessibility.spec.ts` | Zero horizontal overflow at `375px`, `768px`, `1024px`, `1440px`; WCAG 2.2 AA contrast & `<main id="main-content">` landmark | **PASS (`10/10` `[VERIFIED]`)** |
| **18** | **Clinic-Hour Load & Pool Tests** | k6 load script (`35 VUs` steady / `90 VUs` spike) | P95 SSR `< 250 ms`, OPD backfill `< 30 ms`, RDS `DatabaseConnections < 50`, `0` `SQLSTATE 53300` errors | **Gate Defined in `08`** |
| **19** | **Backup Restoration & Hash Verify** | Monthly PITR restore drill + `verifyLedgerChain()` | Restored RDS instance passes `100%` genesis-to-head `ledger_entry` and `audit_event` SHA-256 verification against S3 WORM anchor | **Gate Defined in `10`** |
| **20** | **Deployment Rollback Tests** | ECS circuit breaker + `.github/workflows/deploy.yml` Gate 9 | Injecting a failing `/api/v1/health` task triggers automatic rollback to prior task revision in `< 3 minutes` | **Gate Defined in `06`** |
| **21** | **Security Boundary & Redaction Tests** | `packages/db/test/audit-redaction.test.ts` & `studio-safety-audit.test.ts` | 18+ PHI keys redacted in `audit_event` and `JsonLogger`; de-identified case report strips all 18 Safe Harbor identifiers | **PASS (`[VERIFIED]`)** |
| **22** | **Clinical-Scope Enforcement Tests** | `pnpm boundary:check` (`tools/check-clinical-boundary.ts`) + `classify.test.ts` | `0` forbidden diagnostic/staging/treatment/risk patterns in codebase; `100%` (`36/36`) refusal of medical advice prompts in `0` LLM calls | **PASS (`[VERIFIED]`)** |

---

## 2. Release Readiness Gate Checklist (Demo vs. Clinical Production Pilot)

### Gate A — Hackathon / Synthetic Demo Readiness (`Architecture A`)
- [x] `ONCOBRIEF_DEMO_MODE=true` and all seeded patients (`DEMO-001`..`003`) marked `is_demo_fixture = true`.
- [x] `pnpm verify` passes (`0` clinical boundary violations, `0` test failures).
- [ ] Sync `bundled-migrations.ts` (`0001`–`0023`) and apply to `oncobrief-dev-db`.
- [ ] Set `enable_nat_gateway = false` to stop burning `$44.53/mo` on idle NAT Gateway.

### Gate B — Single-Hospital Production Pilot Readiness (`Architecture B` — Real Patient Data Hard Gate)
- [ ] **All P0 Security Blockers Resolved:**
  - [ ] `SEC-01`: Root access keys deleted; deployment runs via IAM OIDC / SSO role.
  - [ ] `SEC-02`: `oncobrief_app` password rotated and loaded from Secrets Manager / SSM (`no` `.env.example` fallback).
  - [ ] `SEC-03`: CloudFront-to-ALB traffic encrypted (`https-only` via CloudFront VPC Origin + Internal ALB).
  - [ ] `SEC-04`: In-region `ap-south-1` AI endpoint or PHI header stripping enforced before cross-region Bedrock calls.
  - [ ] `SEC-05`: Static `aws_iam_user.web_storage` replaced with ECS `task_role_arn`.
  - [ ] `SEC-06`: `sslmode=verify-full` (`rds-global-bundle.pem`) enforced on both ECS web and Lambda workers.
  - [ ] `SEC-07`: S3 `force_destroy = false` and RDS `deletion_protection = true` + `skip_final_snapshot = false` enabled.
- [ ] **Institutional & Regulatory Sign-Off:**
  - [ ] Hospital Institutional Ethics Committee (IEC) / Data Processing Agreement (DPDP Act Section 8(2)) signed.
  - [ ] Non-SaMD administrative assistive scope confirmed by hospital clinical governance.
