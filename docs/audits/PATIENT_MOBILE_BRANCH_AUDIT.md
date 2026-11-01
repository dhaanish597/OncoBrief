# OncoBrief Patient Mobile Application — Baseline Branch Audit Report

- **Repository:** `https://github.com/dhaanish597/OncoBrief`
- **Audited Branch:** `oncobrief-patient-app`
- **Audited Commit SHA:** `757f4958c565088877bfc5fd1af56ebe1227f1a5`
- **Merge Base with `main`:** `7b2edec145a9efe88f7f3928e6de975743ce33ca`
- **Master Implementation Plan:** [`docs/plans/ONCOBRIEF_PATIENT_MOBILE_MASTER_IMPLEMENTATION_PLAN.md`](../plans/ONCOBRIEF_PATIENT_MOBILE_MASTER_IMPLEMENTATION_PLAN.md)

---

## 1. Executive Audit Verdict

1. **What Is Implemented (`757f4958c565088877bfc5fd1af56ebe1227f1a5`):**
   - A standalone, offline-only Expo SDK 54 / React Native 0.81.5 / Expo Router 6 application in `apps/mobile` (`1,045` lines across 50 text files + 2 PNG assets) with 36 passing Node unit tests (`pnpm --filter @oncobrief/mobile test`) and 5 passing Playwright web E2E tests (`pnpm --filter @oncobrief/mobile test:e2e`).
2. **Critical Blockers Identified:**
   - **Zero Backend Integration (`0%`):** Zero `fetch` / HTTP calls in `apps/mobile`; zero `/api/v1/patient-portal/*` endpoints in `apps/web`; zero integration with `@oncobrief/db` services (`patients.ts`, `documents.ts`, `tasks.ts`, `appointments.ts`, `caregivers.ts`, `messages.ts`) or `scoped-tts.ts`.
   - **Zero Oncology Specificity (`BUG-MOB-02`):** `createDemo()` in `apps/mobile/src/domain.ts:27-47` seeds 5 generic primary-care records (`Comprehensive metabolic panel`, `Lipid panel`, `Primary care visit summary`, `Discharge instructions`, `Abdominal ultrasound summary`) instead of `DEMO-001` (`Meenakshi Sundaram`), `DEMO-002` (`Rajeshwari Nair`), and `DEMO-003` (`Arjun Kulkarni`).
   - **Clinical-Safety Boundary Violations (`BUG-MOB-03`, `BUG-MOB-04`):** `src/patient-selectors.ts:23-28` (`referencePosition`) and `src/laboratory.tsx:10-16` (`ReferenceBar`) classify lab values as `below` / `within` / `above` (`"Below supplied interval"`, `"Above supplied interval"`), and `tools/check-clinical-boundary.ts` omits `apps/mobile` from `TARGET_DIRS`.
   - **Corrupted Tamil UTF-8 Mojibake (`BUG-MOB-01`):** `apps/mobile/app/(tabs)/profile.tsx:8` hardcodes `'родрооро┐ро┤рпН'` instead of `'தமிழ்'`.
   - **Plaintext Local Storage & Bypassed Consent Gate (`SEC-MOB-01`, `BUG-MOB-07`, `BUG-MOB-08`):** `src/storage.ts:13` writes plaintext JSON to `state-v1.json` on native, no-ops on Web (`F5` reload wipes state), and `app/index.tsx:12` auto-dispatches `onboard`, skipping `/onboarding`.
   - **Unverified Native Android Runtime:** No `android/` prebuild or `.apk` artifact has been compiled or tested via `adb`.

All 14 code defects (`BUG-MOB-01`–`BUG-MOB-14`), 7 security findings (`SEC-MOB-01`–`SEC-MOB-07`), and 45 product/technical requirements are mapped to concrete TDD remediation tasks (`MOB-000`–`MOB-024`) in [`docs/plans/ONCOBRIEF_PATIENT_MOBILE_MASTER_IMPLEMENTATION_PLAN.md`](../plans/ONCOBRIEF_PATIENT_MOBILE_MASTER_IMPLEMENTATION_PLAN.md).
