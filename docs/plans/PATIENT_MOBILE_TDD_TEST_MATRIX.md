# OncoBrief Patient Mobile Application — TDD & Multi-Layer Test Matrix

- **Repository:** `https://github.com/dhaanish597/OncoBrief`
- **Target Branch:** `oncobrief-patient-app`
- **Baseline Inspected Commit:** `757f4958c565088877bfc5fd1af56ebe1227f1a5`
- **Document Role:** Mandatory RED → GREEN → REFACTOR Test Engineering Protocol, Test Suite Inventory, Security Negative Test Catalog (`SEC-NEG-01`–`SEC-NEG-20`), Clinical Boundary Test Suite, and E2E Continuity Verification Specification.

---

## 1. Strict Test-Driven Development (TDD) Execution Law

Every engineering task (`MOB-000` through `MOB-024`) MUST execute in the following strict seven-step loop:

1. **Step 1 — Write Failing Tests (RED):**
   - Author the exact unit, database/RLS, API contract, security-negative, clinical-boundary, accessibility, and/or E2E tests specified for the task *before* writing or modifying production code.
   - Run the target test command and record the exact failing command, exit code (`!= 0`), and failure assertion message in `docs/plans/PATIENT_MOBILE_EXECUTION_TRACKER.md`.
2. **Step 2 — Implement Minimal Production Code (GREEN):**
   - Implement only the production code required in `apps/mobile`, `packages/db`, `apps/web`, or `tools/` to satisfy the failing tests and acceptance criteria.
3. **Step 3 — Verify Target Tests Pass:**
   - Re-run the target test command and confirm exit code `0`.
4. **Step 4 — Refactor & Enforce Code Hygiene:**
   - Eliminate duplication, verify TypeScript strictness (`tsc --noEmit`), and ensure existing architectural patterns (`expo-router`, `ui-core.tsx`, `@oncobrief/db` services) are preserved cleanly.
5. **Step 5 — Run Full Regression & Policy Suite:**
   - Run `pnpm --filter @oncobrief/mobile typecheck`, `pnpm --filter @oncobrief/mobile test`, `pnpm policy:check-clinical-boundary`, and `pnpm validate:branding`.
6. **Step 6 — Audit Against Acceptance Criteria & Security Boundary:**
   - Inspect diffs and test assertions against `docs/plans/PATIENT_MOBILE_REQUIREMENTS_MATRIX.md`.
7. **Step 7 — Update Tracker & Commit:**
   - Record test counts, command outputs, and new requirement states in `docs/plans/PATIENT_MOBILE_EXECUTION_TRACKER.md`.

---

## 2. Test Pyramid & Runner Commands

| Layer | Scope | Runner / Tooling | Exact Command | Target Minimum Assertions |
|---|---|---|---|---|
| **Layer 1: Static & Policy Gates** | TypeScript strict mode, clinical boundary AST/regex scan, branding validation, ADR uniqueness | `tsc`, `tsx tools/check-clinical-boundary.ts`, `tsx tools/validate-branding.ts` | `pnpm --filter @oncobrief/mobile typecheck && pnpm policy:check-clinical-boundary && pnpm validate:branding` | Zero errors across all workspaces |
| **Layer 2: Mobile Unit & Selector Tests** | Reducers, oncology cohort, bilingual UTF-8 dictionary, lab non-classification, preparation/share isolation, encrypted storage envelope, offline sync queue, WCAG contrast math | Node.js native test runner (`node --import tsx --test`) | `pnpm --filter @oncobrief/mobile test` | ≥ 85 unit assertions across 12 test files |
| **Layer 3: Database & RLS Integration Tests** | Migration `0022_patient_portal_foundation.sql`, `ENABLE + FORCE ROW LEVEL SECURITY`, cross-patient & cross-hospital isolation, service layer (`packages/db/src/services/patient-portal.ts`) | Node.js test runner + PostgreSQL test instance | `pnpm --filter @oncobrief/db test` | ≥ 30 DB & RLS assertions |
| **Layer 4: API Route Contract & Security Negative Tests** | All `/api/v1/patient-portal/*` endpoints, bearer session validation, OTP rate limiting, MIME magic-byte sniffing, caregiver scope enforcement, clinical boundary rejection | Node.js test runner / Vitest in `apps/web` | `pnpm --filter @oncobrief/web test` | ≥ 45 contract & `SEC-NEG-01`..`20` assertions |
| **Layer 5: Browser E2E & Full Continuity Loop** | Standalone Demo Journeys (`DEMO-001`..`003`), Tamil UI + TTS, `F5` reload persistence, and 20-step Clinician ↔ Patient Continuity E2E | Playwright (`@playwright/test`) | `pnpm --filter @oncobrief/mobile test:e2e` | ≥ 15 end-to-end browser scenarios (`0` console/page errors) |
| **Layer 6: Native Android Bundle, APK & Runtime Smoke** | Hermes bytecode export (`.hbc`), `expo prebuild --platform android`, Gradle `assembleDebug`, `adb install`, `adb logcat` crash check, Maestro native flow | Expo CLI, Gradle, Android SDK (`adb`), Maestro | `bash tools/verify-android-build.sh && bash tools/verify-android-runtime.sh` | Verified `.apk` + native smoke flow |

---

## 3. File-by-File Test Suite Inventory (`MOB-000` – `MOB-024`)

### 3.1 Mobile Unit & Domain Test Suites (`apps/mobile/test/*.test.ts`)

| Test File Path | Task IDs | Requirements Covered | Key RED → GREEN Assertions |
|---|---|---|---|
| `apps/mobile/test/repo-hygiene.test.ts` | `MOB-000` | `REQ-MOB-042` | Asserts unique numeric prefixes across `docs/decisions/*.md` (no duplicate `0017-*`); verifies `apps/mobile/package.json` scripts and dependencies. |
| `apps/mobile/test/localization-utf8.test.ts` | `MOB-001` | `REQ-MOB-029`, `REQ-MOB-031` | Asserts `labels.ta.ta === 'தமிழ்'`; scans all `.ts`/`.tsx` files in `apps/mobile` for zero Cyrillic characters (`[\u0400-\u04FF]`, catching `'родрооро┐ро┤рпН'`); asserts 100% key parity between `labels.en` and `labels.ta` including `editQuestion` and `removeQuestion`; verifies Tamil Unicode range (`[\u0B80-\u0BFF]`) in `labels.ta`. |
| `apps/mobile/test/clinical-boundary-mobile.test.ts` | `MOB-001`, `MOB-002` | `REQ-MOB-005`, `REQ-MOB-006`, `REQ-MOB-007`, `REQ-MOB-008` | Asserts `referencePosition` is undefined in `src/patient-selectors.ts`; scans `apps/mobile/src` and `apps/mobile/app` using `@oncobrief/domain` `scanClinicalBoundaryViolations`; asserts zero occurrences of `below supplied interval`, `within supplied interval`, `above supplied interval`, or abnormal/normal range gauges; verifies non-monitored disclaimer on `care.tsx` and `vital/[id].tsx`. |
| `apps/mobile/test/oncology-cohort.test.ts` | `MOB-003` | `REQ-MOB-001`, `REQ-MOB-002`, `REQ-MOB-003`, `REQ-MOB-004`, `REQ-MOB-031` | Verifies `createDemo('DEMO-001')` (Meenakshi Sundaram — Breast Cancer Stage IIA), `createDemo('DEMO-002')` (Rajeshwari Nair — Ovarian Cancer Stage IIIB), and `createDemo('DEMO-003')` (Arjun Kulkarni — Colon Cancer Stage IIIB); verifies oncology document categories (`pathology`, `imaging`, `lab`, `chemotherapy`, `discharge`), provenance fields (`sourceFacility`, `sha256Prefix`, `pageCount`), oncology glossary terms (`ANC`, `ER/PR/HER2`, `CA-125`, `CEA`, `FOLFOX`, `AC-T`), and bilingual English/Tamil translations. |
| `apps/mobile/test/preparation-sharing-isolation.test.ts` | `MOB-004` | `REQ-MOB-024`, `REQ-MOB-026`, `REQ-MOB-035` | Verifies enabling optional check `c4` (`toggleOptional`) allows `toggleCheck('c4')` to mark `c4.done = true` and increments completion count; verifies `togglePackRecord(id)` mutates `state.packSelected` without modifying `state.shareSelected`, and `toggleShareRecord(id)` mutates `state.shareSelected` without modifying `state.packSelected`; verifies `addQuestion` de-duplicates repeated glossary questions; verifies initial state has `onboarded: false`. |
| `apps/mobile/test/import-transactional.test.ts` | `MOB-004` | `REQ-MOB-016` | Verifies file validation (MIME magic bytes, 10 MB limit, SHA-256 duplicate check against existing `state.records`) executes before `retainSample`; verifies rollback deletes target file if dispatch/save throws; verifies empty date defaults to current ISO date (`YYYY-MM-DD`) with `dateSource: 'upload_date'`. |
| `apps/mobile/test/accessibility-wcag.test.ts` | `MOB-005` | `REQ-MOB-038`, `REQ-MOB-039` | Computes WCAG 2.1/2.2 relative luminance contrast ratios for all foreground/background color pairs in `src/ui-core.tsx` (`c.teal` on `c.sage` ≥ 4.5:1, `c.teal` on `c.paper` ≥ 4.5:1, `c.ink` on `c.paper` ≥ 12:1, `c.muted` on `c.paper` ≥ 4.5:1, input border `c.line` on `c.paper` ≥ 3.0:1); asserts chart components generate non-empty `accessibilityLabel` strings and do not set `accessible={false}`. |
| `apps/mobile/test/sync-queue.test.ts` | `MOB-012` | `REQ-MOB-012` | Verifies `OfflineSyncQueue` enqueues offline mutations (`confirm_attendance`, `flag_discrepancy`, `review_document`, `update_preparation`, `upload_document`, `create_coordinator_request`) with deterministic `idempotencyKey`, persists across restarts, flushes FIFO when connectivity returns, retries transient `503`/network errors with exponential backoff, and drops permanent `4xx` validation errors with user-visible error state. |
| `apps/mobile/test/connected-repository.test.ts` | `MOB-012`, `MOB-013`, `MOB-014`, `MOB-015` | `REQ-MOB-011`..`REQ-MOB-028` | Verifies `ConnectedPatientRepository` maps `GET /api/v1/patient-portal/snapshot` into mobile `State`, preserves distinct `clinicianStatus` vs `patientReview`, syncs missing-document tasks, appointments, timeline events, and approved continuity messages, and falls back to encrypted cached snapshot when offline. |
| `apps/mobile/test/voice-tts.test.ts` | `MOB-016` | `REQ-MOB-030` | Verifies `VoiceTtsController` calls `POST /api/v1/patient-portal/voice-tts` in Connected Mode for `en` and `ta`, decodes WAV audio payload, falls back to local speech synthesis in Offline Demo Mode, and enforces stop/cleanup on screen unmount. |
| `apps/mobile/test/caregiver-sharing.test.ts` | `MOB-017` | `REQ-MOB-032`, `REQ-MOB-033` | Verifies caregiver creation, scope toggling (`appointments`, `reminders`, `documents`, `preparation`), caregiver revocation, and time-bounded share grant creation/revocation using `state.shareSelected`. |
| `apps/mobile/test/encrypted-storage.test.ts` | `MOB-018`, `MOB-019` | `REQ-MOB-034`, `REQ-MOB-036`, `REQ-MOB-037` | Verifies AES-256-GCM encryption/decryption round-trip in `src/crypto-envelope.ts`; asserts raw persisted disk payload contains zero plaintext substrings (`"Meenakshi"`, `"Invasive Ductal"`, `"Hemoglobin"`); verifies authentication tag tamper rejection; verifies Web `localStorage` persistence round-trip (`BUG-MOB-08`); verifies cryptographic erasure on `clearPersisted()`; verifies `state.audit` hash chain (`verifyAuditChain`) and 250-entry cap; verifies `useDraft` 250ms debounce; verifies zero `medlineplus.gov` URLs in `src/laboratory.tsx`. |

---

### 3.2 Database & RLS Integration Test Suites (`packages/db/test/*.test.ts`)

| Test File Path | Task IDs | Requirements Covered | Key RED → GREEN Assertions |
|---|---|---|---|
| `packages/db/test/patient-portal-rls.test.ts` | `MOB-006` | `REQ-MOB-009` | Verifies migration `0022_patient_portal_foundation.sql` creates `patient_portal_session`, `patient_document_review`, `patient_discrepancy_flag`, `patient_preparation_state`, and `patient_share_grant`; inspects `pg_class` (`relrowsecurity = true`, `relforcerowsecurity = true`) for all 5 tables; proves Patient A (`DEMO-001`) cannot SELECT, INSERT, UPDATE, or DELETE rows belonging to Patient B (`DEMO-002`) or another `hospital_id`. |
| `packages/db/test/patient-portal-service.test.ts` | `MOB-006`, `MOB-008`, `MOB-009`, `MOB-010`, `MOB-011` | `REQ-MOB-009`..`REQ-MOB-033` | Tests service functions in `packages/db/src/services/patient-portal.ts`: `createPatientPortalSession`, `verifyPatientPortalSession`, `revokePatientPortalSession`, `getPatientPortalSnapshot`, `recordPatientDocumentReview` (proving `document.status` is never elevated to `'verified'`), `createPatientDiscrepancyFlag` (proving a linked clinician `task` with `category = 'reconciliation'` is created atomically), `upsertPatientPreparationState`, `confirmPatientAppointmentAttendance`, `createPatientCoordinatorRequest`, and `createPatientShareGrant` / `revokePatientShareGrant`. |

---

### 3.3 Backend API Contract & Security Negative Test Catalog (`SEC-NEG-01` – `SEC-NEG-20`)

All 20 security negative test cases MUST be implemented in `apps/web/src/app/api/v1/patient-portal/__tests__/patient-portal-security.test.ts` and route-specific test files:

| Security Test ID | Endpoint / Component | Attack / Negative Vector | Required HTTP / System Response |
|---|---|---|---|
| `SEC-NEG-01` | `GET /api/v1/patient-portal/snapshot` | Missing `Authorization` header | `401 Unauthorized` (`{"error":{"code":"UNAUTHORIZED"}}`) |
| `SEC-NEG-02` | `GET /api/v1/patient-portal/snapshot` | Expired session token (`expires_at < NOW()`) | `401 Unauthorized` (`{"error":{"code":"SESSION_EXPIRED"}}`) |
| `SEC-NEG-03` | `GET /api/v1/patient-portal/snapshot` | Revoked session token (`revoked_at IS NOT NULL`) | `401 Unauthorized` (`{"error":{"code":"SESSION_REVOKED"}}`) |
| `SEC-NEG-04` | `GET /api/v1/patient-portal/snapshot` | Tampered HMAC signature on bearer token | `401 Unauthorized` (`{"error":{"code":"INVALID_SIGNATURE"}}`) |
| `SEC-NEG-05` | `POST /api/v1/patient-portal/session` | > 5 failed OTP attempts within 15 minutes for same `(hospitalSlug, patientExternalId)` | `429 Too Many Requests` with `Retry-After` header |
| `SEC-NEG-06` | `GET /api/v1/patient-portal/documents/[docId]/pages/1` | Patient A (`DEMO-001`) requests a `documentId` belonging to Patient B (`DEMO-002`) (IDOR) | `404 Not Found` (zero metadata leakage) |
| `SEC-NEG-07` | `POST /api/v1/patient-portal/flags` | Patient A attempts to flag a `documentId` belonging to another hospital (`hospital_id` mismatch) | `404 Not Found` (blocked by RLS + service ownership check) |
| `SEC-NEG-08` | `POST /api/v1/patient-portal/documents` | Upload file with `.pdf` extension and `Content-Type: application/pdf` whose magic bytes are `MZ...` (EXE) or `<html><script>` | `415 Unsupported Media Type` via `sniffContentType()` |
| `SEC-NEG-09` | `POST /api/v1/patient-portal/documents` | Upload payload > 10 MB (`10_485_760` bytes) | `413 Payload Too Large` |
| `SEC-NEG-10` | `POST /api/v1/patient-portal/documents/[docId]/review` | Patient submits body attempting privilege escalation (`{"status":"verified","clinicianVerified":true}`) | Ignores unknown fields; writes only `patient_document_review`; `document.status` remains unchanged |
| `SEC-NEG-11` | `GET /api/v1/patient-portal/snapshot` | Database contains a `continuity_message` for Patient A with `status = 'draft'` or `'pending_approval'` | Draft/unapproved message is completely excluded from snapshot response |
| `SEC-NEG-12` | `POST /api/v1/patient-portal/voice-tts` | Patient requests TTS audio synthesis for an unapproved `continuity_message` (`status = 'draft'`) or another patient's `messageId` | `403 Forbidden` / `404 Not Found` |
| `SEC-NEG-13` | `POST /api/v1/patient-portal/caregivers` | Session authenticated with `actorRole = 'caregiver'` attempts to add a new caregiver or escalate their own `consent_scopes` | `403 Forbidden` (`{"error":{"code":"PATIENT_ACTOR_REQUIRED"}}`) |
| `SEC-NEG-14` | `apps/mobile/src/export.ts` (`buildSummaryHtml`) | Patient question or note contains `<script>window.pwned=1</script><img src=x onerror=alert(1)>` | HTML output escapes `<`, `>`, `&`, `"`, `'` into `&lt;script&gt;...` with zero executable markup |
| `SEC-NEG-15` | `POST /api/v1/patient-portal/preparation` | Payload injects prohibited diagnostic/recommendation strings triggering `scanClinicalBoundaryViolations` | `422 Unprocessable Entity` (`{"error":{"code":"CLINICAL_BOUNDARY_VIOLATION"}}`) |
| `SEC-NEG-16` | `GET /api/v1/patient-portal/snapshot` | Caregiver session with `consent_scopes = ['appointments']` requests snapshot | Response includes `appointments` but redacts `documents` (`[]`) and `preparation` (`null`) |
| `SEC-NEG-17` | `GET /api/v1/patient-portal/snapshot` | Caregiver whose `consent_status` was changed to `'revoked'` by the patient attempts API call with previously issued token | `401 Unauthorized` (`{"error":{"code":"CAREGIVER_CONSENT_REVOKED"}}`) |
| `SEC-NEG-18` | `apps/mobile/src/storage.ts` | Attacker flips 1 bit of `ciphertext` or `tag` in local `state-v2.enc.json` | AES-256-GCM authentication fails; storage layer catches integrity error, logs tamper event, and refuses to load corrupted state |
| `SEC-NEG-19` | `POST /api/v1/patient-portal/documents` | Patient re-uploads the exact same PDF file bytes (`sha256` already present for patient) | `409 Conflict` (`{"error":{"code":"DUPLICATE_DOCUMENT"}}`) with existing `documentId` reference |
| `SEC-NEG-20` | `DELETE /api/v1/patient-portal/shares/[grantId]` | Accessing a revoked or expired (`expires_at < NOW()`) share grant token | `410 Gone` / `403 Forbidden` |

---

### 3.4 Playwright Browser E2E Suites (`apps/mobile/e2e/*.spec.ts`)

| Spec File | Scenarios Tested |
|---|---|
| `apps/mobile/e2e/patient-app.spec.ts` | 1. First-launch Onboarding Consent Gate (`REQ-MOB-035`) — verifies `/onboarding` renders before `/(tabs)`.<br>2. Tamil Language Toggle & UTF-8 Integrity (`REQ-MOB-029`, `REQ-MOB-031`) — verifies `'தமிழ்'` button text, Tamil checklist/glossary rendering, and zero Cyrillic Mojibake.<br>3. Oncology Cohort Persona Switching (`DEMO-001`, `DEMO-002`, `DEMO-003`) (`REQ-MOB-001`..`004`).<br>4. Lab Verbatim Display & Zero Range Classification (`REQ-MOB-005`) — asserts absence of `below`/`within`/`above` labels.<br>5. Consultation Preparation (`c4` optional check, glossary-to-question deduplication & stage routing, `packSelected` vs `shareSelected` isolation) (`REQ-MOB-024`, `REQ-MOB-026`).<br>6. Transactional Import & Duplicate Detection (`REQ-MOB-016`).<br>7. Browser Reload (`F5`) State Persistence (`REQ-MOB-034` / `BUG-MOB-08`).<br>8. Consent Revocation & Full Data Wipe (`REQ-MOB-035`). |
| `apps/mobile/e2e/clinician-patient-continuity.spec.ts` | Executes the complete **20-Step Clinician-to-Patient E2E Continuity Scenario** (defined in Section 11.2 of the Master Plan):<br>- Coordinator schedules appointment & creates `missing_document` task → Patient signs in on mobile (`DEMO-001`) → Sees appointment & missing-document alert → Confirms attendance → Uploads outside IHC PDF against the missing-document task → Flags a date discrepancy on an existing summary → Adds 2 oncology questions in Consultation Prep → Clinician approves a Tamil/English continuity instruction → Patient receives approved instruction on mobile & plays Tamil voice TTS (`POST /api/v1/patient-portal/voice-tts`) → Patient adds consented caregiver (`Suresh Sundaram`) with scoped permissions → Patient revokes share grant → Verifies clinician dashboard reflects confirmed attendance, uploaded PDF, reconciliation task from patient flag, and updated caregiver consent. |
