# OncoBrief — Unified Release Runbook
**Document ID:** `UNIFIED_RELEASE_RUNBOOK.md`  
**Phase:** 05 — Unified Web + Patient Mobile Release, Cross-Platform Integration, and Complete-Scope Verification  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-03  
**Auditor:** DevOps Engineer, Healthcare Security Engineer  

---

## 1. Prerequisites & Environment Specification

* **Node.js:** v24.21.0 (LTS/Current)
* **Package Manager:** pnpm 9.15.4
* **Database:** PostgreSQL 16 with Row-Level Security (RLS)
* **Java Development Kit (JDK):** OpenJDK 17 (`JAVA_HOME`)
* **Android SDK:** Command Line Tools 35.0.0 (`ANDROID_HOME`)
* **Operating Systems Supported:** macOS (Apple Silicon & Intel), Linux (Ubuntu 24.04), Windows (WSL2)

### Required Environment Variables (`.env`):
```env
# Database & Core
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/oncobrief
SESSION_SECRET=oncobrief-secret-key-min-32-chars-long-0123456789

# AI & Multilingual Services
SARVAM_API_KEY=sk_live_...

# Networking & CORS
NEXT_PUBLIC_APP_URL=http://localhost:3000
PATIENT_PORTAL_CORS_ORIGINS=http://localhost:8087,http://127.0.0.1:8087
```

---

## 2. Step-by-Step Release Build & Verification Protocol

### Step 1: Workspace Installation & Database Migration
```bash
# Link workspace dependencies across all 7 projects
pnpm install

# Run database migrations up through 0022_patient_portal_foundation
pnpm --filter @oncobrief/db migrate

# Seed deterministic synthetic demo fixture (DEMO-001, DEMO-002, DEMO-003)
pnpm demo:reset
```

### Step 2: Static Quality, Branding & Boundary Enforcement
```bash
# Verify strict non-diagnostic clinical boundaries (0 violations required)
pnpm boundary:check

# Verify single-product branding across all shipped surfaces
pnpm branding:check

# Monorepo typecheck across all 7 workspace projects
pnpm -r --no-bail typecheck
```

### Step 3: Complete Automated Test Execution
```bash
# Unit & integration tests (1,222 tests)
pnpm --filter @oncobrief/domain test
pnpm --filter @oncobrief/adapters test
pnpm --filter @oncobrief/db test
pnpm --filter @oncobrief/web test
pnpm --filter @oncobrief/worker test

# Execute 6 patient-mobile release gates (119 unit + 85 API + 10 RLS + Hermes check)
bash tools/verify-patient-mobile.sh

# Web Playwright E2E suite (92 passing, 5 cloud-deployed skipped)
pnpm --filter @oncobrief/web test:e2e

# Patient Mobile E2E suite (9 passing, including 20-step loop)
pnpm --filter @oncobrief/mobile test:e2e
```

### Step 4: Production Artifact Compilation
```bash
# Web: Next.js 15 production build (compiles 33 routes)
pnpm --filter @oncobrief/web build

# Mobile: Hermes Android standalone bundle export
cd apps/mobile
npx expo export --platform android --output-dir dist-android
cd ../..

# Mobile: Native Android APK build (assembleDebug)
bash tools/verify-android-build.sh
```

---

## 3. Deployment & Operational Commands

### Staging / Local Demo Servers:
```bash
# Terminal 1: Clinician Web Platform & Patient Portal API
pnpm start

# Terminal 2: Standalone Patient Mobile Preview (Port 8087)
node apps/mobile/tools/serve-preview.cjs 8087
```

### Native Android Device Deployment:
```bash
# Install to connected device or emulator via ADB
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk

# Launch OncoBrief Patient App
adb shell am start -n org.oncobrief.patient/.MainActivity
```
