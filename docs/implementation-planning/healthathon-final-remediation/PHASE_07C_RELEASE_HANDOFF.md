# Phase 07C Release Staging, Deployment Gates, & Final Sign-Off Handoff

**Date:** 2026-11-03  
**Target Phase:** 07C — Release Staging, Cloud Deployment, and Final Operational Sign-Off  
**Source Phase:** 07B — Completed Interoperability & Security Verification  
**Branch:** `feat/v4-assessment-remediation` (HEAD `7b2edec`)  
**Audience:** Release Engineering Lead, Site Reliability Engineer, Judging Panel  

---

## 1. Release Baseline & Inherited State

Phase 07B successfully resolved all technical and verification milestones for healthcare interoperability, ABDM production engineering, and consent security:
- **1,446 unit & integration tests passing** across 7 workspaces.
- **102 web & mobile Playwright E2E journeys passing** (0 failed).
- **124 mobile unit & component specs passing**.
- **Android debug APK and Hermes AOT bytecode bundles compiled**.
- **Native iOS Xcode project and Hermes bytecode bundles compiled**.
- **PostgreSQL 16 migrations 0001 through 0023 applied and verified**.
- **All uncommitted changes strictly preserved** in the working tree without unauthorized commits.

---

## 2. Phase 07C Scope & Key Objectives

Phase 07C represents the **final operational milestone**:
1. **Cloud Environment Staging Verification:** Deploy the validated container image to the designated AWS staging environment (ECS Fargate + RDS PostgreSQL 16 + S3 Bucket) once authorized credentials/budget are available.
2. **Execute Five Cloud-Deployed Specs:** Un-skip and execute `apps/web/e2e/deployed.spec.ts` against the live staging URL (`E2E_BASE_URL="https://staging.oncobrief.org"`).
3. **Android Physical Device / Emulator Verification:** Attach a live physical Android test device or run a headless Android Virtual Device (AVD API 34/35) to execute the automated Maestro test suite (`login-and-boundary.yaml`, `consultation-packet.yaml`).
4. **Final Security Audit & Cryptographic Seal:** Run a clean Git diff review, verify secret hygiene, and produce the final tamper-evident release hash.
5. **Final Executive Sign-Off & Presentation Assets:** Generate final judging presentation slides and executive summary.

---

## 3. Pre-Flight Deployment Checklist

```
[ ] Step 1: Database Migration Check
    Verify migrations 0001_initial.sql through 0023_fhir_interoperability.sql.
    Run `pnpm db:migrate` against target database.
    Verify `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` are active.

[ ] Step 2: Secret Hygiene Verification
    Verify `.env` and `.env.local` are in `.gitignore`.
    Ensure zero plaintext API keys or AWS credentials exist in tracked Git files.
    Verify SARVAM_API_KEY and AWS_SECRET_ACCESS_KEY are injected via runtime environment variables.

[ ] Step 3: Container Build & Health Check
    Execute Docker build for web and worker services:
    docker build -t oncobrief-web -f apps/web/Dockerfile .
    Verify non-root user execution, multi-stage builder pattern, and curl /healthz endpoint.

[ ] Step 4: Mobile App Store Packaging
    Android: Generate signed release AAB via `cd apps/mobile/android && ./gradlew bundleRelease`.
    iOS: Archive Xcode project via `xcodebuild -workspace OncoBrief.xcworkspace -scheme OncoBrief archive`.

[ ] Step 5: Rollback Strategy
    In the event of database migration failure:
    PostgreSQL transactional DDL allows clean rollback of migration scripts prior to commit.
    In the event of web container regression:
    ECS service rollbacks to prior task definition revision automatically upon healthcheck failure.
```

---

## 4. Operational Runbook Commands

### 4.1 Full Monorepo Sanity Check
```bash
# Typecheck
pnpm -r --no-bail typecheck

# Clinical safety and branding policy scanners
pnpm boundary:check
pnpm branding:check

# Unit and integration tests
pnpm test

# Mobile release gate verification
./tools/verify-patient-mobile.sh
```

### 4.2 Web Production Build & E2E Validation
```bash
# Build web production bundle
pnpm --filter @oncobrief/web build

# Run Playwright E2E test suite
pnpm --filter @oncobrief/web test:e2e

# Run connected interoperability scenarios
pnpm --filter @oncobrief/web exec playwright test e2e/fhir-abdm-interop.spec.ts
```

### 4.3 Clean Database Fixture Reset
```bash
# Resets synthetic patient DEMO-001, DEMO-002, DEMO-003 and RCI organization
pnpm demo:reset
```

---

## 5. Contact & Architectural Authority

For questions regarding clinical boundary invariants, closed vocabulary rules, or cryptographic protocols:
- **Architectural Rules:** See [`CLAUDE.md`](file:///Users/dhaanish/Documents/OncoBrief/CLAUDE.md) and [`AGENTS.md`](file:///Users/dhaanish/Documents/OncoBrief/AGENTS.md).
- **Standards Baseline:** See [`docs/implementation-planning/healthathon-final-remediation/FHIR_ABDM_CONTRACT_BASELINE.md`](file:///Users/dhaanish/Documents/OncoBrief/docs/implementation-planning/healthathon-final-remediation/FHIR_ABDM_CONTRACT_BASELINE.md).
