# OncoBrief Patient Mobile Application — Milestone Exit Gates, Android Build Pipeline & Release Readiness Protocol

- **Repository:** `https://github.com/dhaanish597/OncoBrief`
- **Target Branch:** `oncobrief-patient-app`
- **Baseline Inspected Commit:** `757f4958c565088877bfc5fd1af56ebe1227f1a5`
- **Document Role:** Mandatory Milestone Exit Criteria (`M0`–`M7`), Native Android Build & Runtime Verification Pipeline, CI/CD Workflow Specification, and Environment Blocker Recovery Runbooks.

---

## 1. Milestone Exit Gates (`M0` through `M7`)

No milestone may be declared complete unless **100% of its exit commands return exit code `0`** and all associated evidence is logged in `docs/plans/PATIENT_MOBILE_EXECUTION_TRACKER.md`.

### Milestone 0 (`M0`) — Safe Worktree Isolation, Baseline Snapshot & ADR Hygiene (`MOB-000`)
- **Objective:** Isolate all mobile/continuity work in a dedicated Git worktree (`../OncoBrief-patient-mobile`) so the dirty main checkout (`/Users/dhaanish/Documents/OncoBrief` on `feat/v4-assessment-remediation`) is never touched, and fix ADR numbering collision (`0017` → `0018`).
- **Mandatory Verification Commands:**
  1. `git -C /Users/dhaanish/Documents/OncoBrief status --short | wc -l` (verifies main checkout untouched).
  2. `git -C ../OncoBrief-patient-mobile rev-parse HEAD` (confirms worktree starts at `757f4958c565088877bfc5fd1af56ebe1227f1a5` or clean branch off `main`).
  3. `pnpm --filter @oncobrief/mobile test` (passes `repo-hygiene.test.ts` verifying unique ADR prefixes `0001`..`0026`).
- **Exit Criteria:** Worktree isolated, ADR collision resolved (`docs/decisions/0026-patient-mobile-architecture.md`, de-conflicted from occupied 0018-0025 range), baseline tests green.

### Milestone 1 (`M1`) — Clinical Safety Remediation, Oncology Cohort Alignment, Bug Fixes & WCAG Accessibility (`MOB-001` – `MOB-005`)
- **Objective:** Eliminate all P0/P1 clinical safety violations (`BUG-MOB-03`, `BUG-MOB-04`), fix Tamil UTF-8 Mojibake (`BUG-MOB-01`, `BUG-MOB-10`), replace generic mock records with the 3 oncology personas (`DEMO-001`..`003`, `BUG-MOB-02`), fix state/workflow bugs (`BUG-MOB-05`..`07`, `09`, `11`), and remediate WCAG 2.2 AA contrast & accessibility (`BUG-MOB-12`).
- **Mandatory Verification Commands:**
  1. `pnpm policy:check-clinical-boundary` (scans `apps/mobile/src` and `apps/mobile/app`; exits `0`).
  2. `pnpm validate:branding` (exits `0`).
  3. `pnpm --filter @oncobrief/mobile typecheck` (exits `0`).
  4. `pnpm --filter @oncobrief/mobile test` (runs `localization-utf8.test.ts`, `clinical-boundary-mobile.test.ts`, `oncology-cohort.test.ts`, `preparation-sharing-isolation.test.ts`, `import-transactional.test.ts`, `accessibility-wcag.test.ts`; exits `0`).
- **Exit Criteria:** Standalone oncology mobile experience is 100% clinically safe, bilingual (`en`/`ta` with zero Mojibake), oncology-specific (`DEMO-001`..`003`), and WCAG 2.2 AA compliant.

### Milestone 2 (`M2`) — Backend Patient-Portal Database Schema, RLS & API Route Handlers (`MOB-006` – `MOB-011`)
- **Objective:** Land migration `0022_patient_portal_foundation.sql` with `ENABLE + FORCE ROW LEVEL SECURITY` on all 5 new patient-portal tables, implement `packages/db/src/services/patient-portal.ts`, and expose all `/api/v1/patient-portal/*` endpoints (`session`, `snapshot`, `documents`, `review`, `flags`, `preparation`, `attendance`, `caregivers`, `voice-tts`, `requests`, `shares`).
- **Mandatory Verification Commands:**
  1. `pnpm --filter @oncobrief/db test` (runs `patient-portal-rls.test.ts` and `patient-portal-service.test.ts`; exits `0`).
  2. `pnpm --filter @oncobrief/web typecheck` (exits `0`).
  3. `pnpm --filter @oncobrief/web test` (runs all `/api/v1/patient-portal/*` route contract tests; exits `0`).
- **Exit Criteria:** All backend endpoints and PostgreSQL RLS policies are verified against live test database instances with tenant and patient isolation proven.

### Milestone 3 (`M3`) — Connected Mobile Repository, Offline Outbox Queue & End-to-End Feature Wiring (`MOB-012` – `MOB-017`)
- **Objective:** Connect `apps/mobile` to `/api/v1/patient-portal/*` via `ConnectedPatientRepository` and `OfflineSyncQueue` while preserving `DemoRepository` for offline synthetic demos; wire Records, Upload, Review/Flag, Missing-Document Tasks, Appointments, Care Journey Timeline, Consultation Prep, Continuity Messages, Tamil/English Voice TTS (`VoicePlayerBar`), Coordinator Requests, Caregiver Consent, and Share Grants.
- **Mandatory Verification Commands:**
  1. `pnpm --filter @oncobrief/mobile typecheck` (exits `0`).
  2. `pnpm --filter @oncobrief/mobile test` (runs `sync-queue.test.ts`, `connected-repository.test.ts`, `voice-tts.test.ts`, `caregiver-sharing.test.ts`; exits `0`).
- **Exit Criteria:** Mobile app operates seamlessly in both Connected Hospital Mode and Offline Synthetic Demo Mode.

### Milestone 4 (`M4`) — Local Encryption (`AES-256-GCM` + `expo-secure-store`), Privacy Shield & Performance Hardening (`MOB-018` – `MOB-019`)
- **Objective:** Replace plaintext `state-v1.json` with authenticated AES-256-GCM encryption keyed via `expo-secure-store`, add Web `localStorage` persistence so browser reloads (`F5`) preserve state (`BUG-MOB-08`), cap and hash-chain `state.audit` (`SEC-MOB-07`), debounce `useDraft` (`BUG-MOB-13`), add background `PrivacyShieldOverlay` + `FLAG_SECURE` (`SEC-MOB-05`), and remove external `medlineplus.gov` URL leakage (`SEC-MOB-06`).
- **Mandatory Verification Commands:**
  1. `pnpm --filter @oncobrief/mobile test` (runs `encrypted-storage.test.ts` and `privacy-shield.test.ts`; exits `0`).
  2. `pnpm policy:check-clinical-boundary` (exits `0`).
- **Exit Criteria:** Zero plaintext PHI on disk, tamper-evident storage and audit log, zero third-party URL leakage, and 0 ms typing latency in `useDraft`.

### Milestone 5 (`M5`) — Security Negative Suite (`SEC-NEG-01`..`20`) & 20-Step Clinician-to-Patient E2E Verification (`MOB-020` – `MOB-021`)
- **Objective:** Verify all 20 security negative test vectors and run the full Playwright E2E suite covering both standalone demo journeys (`DEMO-001`..`003`) and the 20-step connected clinician-to-patient continuity loop.
- **Mandatory Verification Commands:**
  1. `pnpm --filter @oncobrief/web test` (verifies `SEC-NEG-01`..`SEC-NEG-20`; exits `0`).
  2. `pnpm --filter @oncobrief/mobile test:e2e` (runs `patient-app.spec.ts` and `clinician-patient-continuity.spec.ts`; exits `0` with `0` console/page errors).
- **Exit Criteria:** **Connected Web/API + Mobile E2E Release Readiness = 100%**.

### Milestone 6 (`M6`) — Native Android Packaging, APK Generation & Emulator/Device Runtime Verification (`MOB-022` – `MOB-023`)
- **Objective:** Verify native Android Hermes bundle compilation, generate `android/` native project via `expo prebuild --platform android`, build `app-debug.apk` via `./gradlew assembleDebug`, install via `adb install -r`, and run native Android runtime smoke tests (`tools/verify-android-runtime.sh`).
- **Mandatory Verification Commands:**
  1. `cd apps/mobile && npx expo export --platform android --output-dir /tmp/oncobrief-android-export` (verifies Hermes `.hbc` bundle compilation; exits `0`).
  2. `bash tools/verify-android-build.sh` (runs `expo prebuild --platform android` and `./gradlew assembleDebug`, outputs APK path and SHA-256 hash).
  3. `bash tools/verify-android-runtime.sh` (installs APK via `adb install -r`, launches `com.oncobrief.patient/.MainActivity`, executes Maestro/UIAutomator smoke journey, verifies `adb logcat -d *:E` has zero `FATAL EXCEPTION`).
- **Exit Criteria:** **Native Android Pilot Readiness = 100%**.

### Milestone 7 (`M7`) — Monorepo CI/CD Gate Integration & Final Release Sign-Off (`MOB-024`)
- **Objective:** Wire `pnpm verify:patient-mobile` into root `package.json` and `.github/workflows/ci.yml`, run all 9 self-review audit passes, and publish final release sign-off evidence.
- **Mandatory Verification Commands:**
  1. `pnpm verify:patient-mobile` (exits `0`).
  2. `git status --short` in `/Users/dhaanish/Documents/OncoBrief` (confirms main worktree was never disturbed).

---

## 2. Native Android Build & Runtime Verification Pipeline (`MOB-022` & `MOB-023`)

This plan enforces a strict separation between **4 distinct verification levels** so no engineer or agent ever conflates a web preview with a native Android build:

| Verification Tier | What It Proves | Exact Command | Sufficient for `NATIVE_VERIFIED`? |
|---|---|---|---|
| **Tier 1: TypeScript + Node Unit Tests** | Domain logic, selectors, crypto envelope, sync queue, WCAG math | `pnpm --filter @oncobrief/mobile typecheck && pnpm --filter @oncobrief/mobile test` | **NO** |
| **Tier 2: Expo Web + Playwright E2E** | UI layout, navigation, bilingual copy, connected API integration in Chromium | `pnpm --filter @oncobrief/mobile test:e2e` | **NO** |
| **Tier 3: Android Hermes Bundle Export** | Metro bundler resolves all native `.android.ts` / React Native modules and compiles Hermes bytecode (`.hbc`) | `cd apps/mobile && npx expo export --platform android` | **NO (Bundle-only)** |
| **Tier 4A: Native Android APK Build** | Gradle + Android SDK compile native Kotlin/Java + C++ + Hermes bundle into installable `.apk` | `cd apps/mobile && npx expo prebuild --platform android && cd android && ./gradlew assembleDebug` | **Partial (Build verified)** |
| **Tier 4B: Native Android Runtime Smoke** | APK installs via `adb`, launches on Android OS, renders native Views, accesses Keystore/FileSystem without crash | `adb install -r android/app/build/outputs/apk/debug/app-debug.apk && maestro test maestro/patient-smoke.yaml` | **YES (`NATIVE_VERIFIED`)** |

---

## 3. Environment Blocker & Recovery Runbook

If the execution host fails a prerequisite check during Milestone 2 (PostgreSQL) or Milestone 6 (Android SDK / JDK / Emulator), the coding agent MUST follow this exact recovery runbook:

### Runbook A — Missing Android SDK / `adb` / Emulator on Local macOS Host
1. **Detection Command:**
   ```bash
   command -v adb && test -n "${ANDROID_HOME:-$HOME/Library/Android/sdk}" && ls "${ANDROID_HOME:-$HOME/Library/Android/sdk}/platforms"
   ```
2. **If Present:** Execute `MOB-022` and `MOB-023` locally and transition `REQ-MOB-040` and `REQ-MOB-041` to `NATIVE_VERIFIED` → `COMPLETE`.
3. **If Absent on Local Machine:**
   - Still execute **Tier 3 (`npx expo export --platform android`)** locally and record the `.hbc` bundle artifact size and SHA-256.
   - Commit the reproducible Android build & smoke scripts (`tools/verify-android-build.sh`, `tools/verify-android-runtime.sh`, `apps/mobile/maestro/patient-smoke.yaml`, and `.github/workflows/android-apk.yml` using `ubuntu-latest` with pre-installed Android SDK & KVM emulator).
   - Mark `MOB-022` (APK compilation) and `MOB-023` (device runtime) as `BLOCKED` in `PATIENT_MOBILE_EXECUTION_TRACKER.md` with exact diagnostic output (`ANDROID_HOME not found`) and instructions to either:
     - Install Android SDK Command-Line Tools (`brew install --cask android-commandlinetools && sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" "system-images;android-35;google_apis;arm64-v8a"`), **or**
     - Trigger the committed `.github/workflows/android-apk.yml` GitHub Actions workflow which builds `app-debug.apk` and runs the emulator smoke test in CI.
   - **Never falsify `NATIVE_VERIFIED` when `adb` / Android SDK is absent.**
