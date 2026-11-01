# OncoBrief Patient Mobile Application — Canonical Requirements Matrix

- **Repository:** `https://github.com/dhaanish597/OncoBrief`
- **Target Branch:** `oncobrief-patient-app`
- **Baseline Inspected Commit:** `757f4958c565088877bfc5fd1af56ebe1227f1a5`
- **Mainline Merge Base:** `7b2edec145a9efe88f7f3928e6de975743ce33ca`
- **Document Role:** Canonical Requirements Inventory, Authority Classification, Traceability Matrix, and State-Machine Status Tracker (Companion to `ONCOBRIEF_PATIENT_MOBILE_MASTER_IMPLEMENTATION_PLAN.md`).

---

## 1. Requirement Status State Machine

Every requirement in this matrix is governed by a strict, monotonic verification state machine. No requirement may transition to `COMPLETE` without passing through its required intermediate verification states and recording reproducible command outputs and test evidence in `docs/plans/PATIENT_MOBILE_EXECUTION_TRACKER.md`.

```
NOT_STARTED
   │
   ▼
TESTS_WRITTEN_RED ──► IMPLEMENTING ──► TESTS_GREEN ──► INTEGRATION_VERIFIED ──► E2E_VERIFIED ──► NATIVE_VERIFIED ──► COMPLETE
                                            │                    │                    │                   │
                                            └────────────────────┴────────────────────┴───────────────────┴──► BLOCKED
```

### Valid Status Definitions

| Status | Entry Criteria | Allowed Next States |
|---|---|---|
| `NOT_STARTED` | Requirement defined and audited against commit `757f4958c565088877bfc5fd1af56ebe1227f1a5`; failing tests for target behavior not yet committed. | `TESTS_WRITTEN_RED`, `BLOCKED`, `REJECTED_OUT_OF_SCOPE` |
| `TESTS_WRITTEN_RED` | Unit, integration, contract, security, and/or E2E tests written and confirmed failing (`exit code != 0`) for the expected missing capability or bug. | `IMPLEMENTING`, `BLOCKED` |
| `IMPLEMENTING` | Code changes underway in isolated worktree (`../OncoBrief-patient-mobile`); not all tests green yet. | `TESTS_GREEN`, `BLOCKED` |
| `TESTS_GREEN` | All unit and component tests for the requirement pass (`pnpm --filter @oncobrief/mobile test`, `pnpm --filter @oncobrief/db test`). | `INTEGRATION_VERIFIED`, `E2E_VERIFIED`, `BLOCKED` |
| `INTEGRATION_VERIFIED` | Live backend route handlers (`/api/v1/patient-portal/*`), PostgreSQL RLS policies, and mobile repository sync verified against test database. | `E2E_VERIFIED`, `BLOCKED` |
| `E2E_VERIFIED` | Automated Playwright browser E2E suite (`pnpm --filter @oncobrief/mobile test:e2e`) and full clinician-to-patient continuity flow pass with zero console/page errors. | `NATIVE_VERIFIED`, `COMPLETE` (only if requirement has no native-specific hardware/APK dependency), `BLOCKED` |
| `NATIVE_VERIFIED` | Verified on Android debug/release APK installed via `adb install` on Android Emulator/Device (`./gradlew assembleDebug` + Maestro/instrumentation smoke suite). | `COMPLETE`, `BLOCKED` |
| `BLOCKED` | External environment blocker (e.g., Android SDK missing) documented with exact reproduction command, stderr, and unblock runbook. | Previous active state once blocker is resolved |
| `REJECTED_OUT_OF_SCOPE` | Explicitly prohibited by the non-clinical safety boundary (`docs/decisions/0001-clinical-boundary.md`) or rejected scope creep. | Terminal state |
| `COMPLETE` | All required Unit, Integration, Security, Accessibility, Browser E2E, and Native Android checks pass with recorded artifact paths and command outputs. | Terminal state (reverts to `IMPLEMENTING` if regression detected) |

---

## 2. Requirements Authority & Precedence Hierarchy

When resolving conflicts between documents or existing code in `apps/mobile`, the following strict precedence order applies:

1. **`OFFICIAL_HACKATHON` (Rank 1 — Highest Authority):** Health-a-thon 2026 Cancer Care track problem statement, patient continuity mandate, and strict non-diagnostic safety boundary (`docs/decisions/0001-clinical-boundary.md`, `packages/domain/src/policy/clinical-boundary.ts`).
2. **`ORIGINAL_ONCOBRIEF` (Rank 2):** Core OncoBrief evidence-ledger and thin non-clinical patient continuity specification (`README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/patient-continuity.md`, `docs/decisions/0001`–`0016`).
3. **`V4_ENHANCEMENT_PLAN` (Rank 3):** Connected oncology workflow covering consultation readiness, OPD flow, appointment confirmation, missing-document tasks, multilingual voice/text accessibility, and consented caregiver participation (`ONCOBRIEF_ENHANCEMENT_PLAN.md`, migrations `0015`–`0021`, `packages/db/src/services/*`).
4. **`MOBILE_EXTENSION` (Rank 4 — Lowest Authority):** Mobile-specific architecture decisions (`docs/decisions/0017-independent-patient-android.md`, `docs/superpowers/plans/2026-10-28-patient-android.md`, `2026-10-29-patient-upgrade.md`). Subordinate to Ranks 1–3; any conflict with oncology alignment, backend integration, or clinical safety is overridden by Ranks 1–3.

---

## 3. Canonical Requirements Inventory (`REQ-MOB-001` – `REQ-MOB-045`)

Every requirement below contains all 21 mandatory governance attributes:
1. **ID** | 2. **Workstream** | 3. **Feature Name** | 4. **Product Objective** | 5. **Source Document** | 6. **Requirement Authority** | 7. **Classification** | 8. **Target User** | 9. **User Story** | 10. **Existing Implementation (`757f495`)** | 11. **Current Status** | 12. **Exact Source Files** | 13. **API / Data Dependency** | 14. **Security Dependency** | 15. **Acceptance Criteria** | 16. **Unit Tests Required** | 17. **Integration Tests Required** | 18. **E2E / Native Tests Required** | 19. **Milestone** | 20. **Priority** | 21. **Definition of Done (Task ID)**.

### Summary Table of All 45 Canonical Requirements

| Req ID | WS | Feature Name | Authority | Class | Milestone | Priority | Task ID | Baseline State (`757f495`) | Status |
|---|---|---|---|---|---|---|---|---|---|
| `REQ-MOB-001` | A | Oncology Synthetic Demo Cohort Alignment (`DEMO-001`..`003`) | `OFFICIAL_HACKATHON` | `CORE` | M1 | P0 | `MOB-003` | Generic non-oncology records (`d1`–`d5`) | `COMPLETE` |
| `REQ-MOB-002` | A | Oncology Journey Stage & Cycle Ribbon on Home Dashboard | `V4_ENHANCEMENT_PLAN` | `CORE` | M1 | P0 | `MOB-003` | Generic document counters (`app/(tabs)/index.tsx`) | `COMPLETE` |
| `REQ-MOB-003` | A | Consultation Readiness Score & Missing-Item Banner | `V4_ENHANCEMENT_PLAN` | `CORE` | M1 | P0 | `MOB-003` | Missing; only generic checklist exists | `COMPLETE` |
| `REQ-MOB-004` | A | Oncology-Specific Preparation Checklist & Question Prompts | `ORIGINAL_ONCOBRIEF` | `CORE` | M1 | P0 | `MOB-003` | Generic primary-care checklist (`src/domain.ts:51`) | `COMPLETE` |
| `REQ-MOB-005` | B | Lab Reference Interval Classification Removal (`BUG-MOB-04`) | `OFFICIAL_HACKATHON` | `CORE` | M1 | P0 | `MOB-002` | Violates boundary (`below`/`within`/`above` gauge) | `COMPLETE` |
| `REQ-MOB-006` | B | CI Clinical Boundary Scanner Coverage for `apps/mobile` (`BUG-MOB-03`) | `OFFICIAL_HACKATHON` | `CORE` | M1 | P0 | `MOB-001` | `tools/check-clinical-boundary.ts` skips `apps/mobile` | `COMPLETE` |
| `REQ-MOB-007` | B | Factual-Only Vital & Wellbeing Self-Log Without Scoring | `MOBILE_EXTENSION` | `OPTIONAL` | M1 | P1 | `MOB-002` | Partial; needs explicit non-monitored disclaimer | `COMPLETE` |
| `REQ-MOB-008` | B | Prohibition of Autonomous Triage, Risk Scoring & Dosing Advice | `OFFICIAL_HACKATHON` | `REJECTED_OUT_OF_SCOPE` | M1 | P0 | `MOB-001` | Guarded only by local regex in `mobile-app.test.ts` | `COMPLETE` |
| `REQ-MOB-009` | C | Patient Portal Database Schema & RLS (`0022_patient_portal_foundation.sql`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M2 | P0 | `MOB-006` | Missing (`0` patient-portal tables in `packages/db`) | `COMPLETE` |
| `REQ-MOB-010` | C | Patient OTP/Session Authentication API (`POST/DELETE /api/v1/patient-portal/session`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M2 | P0 | `MOB-007` | Fake offline toggle in `app/signin.tsx` | `COMPLETE` |
| `REQ-MOB-011` | C | Patient Portal Snapshot API (`GET /api/v1/patient-portal/snapshot`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M2 | P0 | `MOB-008` | Missing (`0` network calls in `apps/mobile`) | `COMPLETE` |
| `REQ-MOB-012` | C | Hybrid Repository Architecture (`ConnectedPatientRepository` + `DemoRepository` + `OfflineSyncQueue`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M3 | P0 | `MOB-012` | Hybrid repository with live API client, sync queue, and clean mode switching | `COMPLETE` |
| `REQ-MOB-013` | D | Source-Backed Oncology Document Vault & Provenance Badges | `ORIGINAL_ONCOBRIEF` | `CORE` | M3 | P0 | `MOB-013` | Vault with separate clinician verification & patient review status | `COMPLETE` |
| `REQ-MOB-014` | D | Authorized Document Page Viewer (`GET /api/v1/patient-portal/documents/[id]/pages/[page]`) | `ORIGINAL_ONCOBRIEF` | `CORE` | M2 | P0 | `MOB-008` | Local text summary + local sample image URI only | `COMPLETE` |
| `REQ-MOB-015` | D | Patient Document Upload to Backend (`POST /api/v1/patient-portal/documents`) | `ORIGINAL_ONCOBRIEF` | `CORE` | M2 | P0 | `MOB-009` | Copies to local sandbox only (`app/import.tsx`) | `COMPLETE` |
| `REQ-MOB-016` | D | Transactional Local File Import, Date Fallback & SHA-256 Deduplication (`BUG-MOB-09`) | `MOBILE_EXTENSION` | `CORE` | M1 | P1 | `MOB-004` | Leaks orphan files; blank `date: ''`; no SHA-256 check | `COMPLETE` |
| `REQ-MOB-017` | D | Document Ingestion Status & Verification Badge Lifecycle | `V4_ENHANCEMENT_PLAN` | `CORE` | M3 | P0 | `MOB-013` | Dual badges; patient review never elevates clinician status | `COMPLETE` |
| `REQ-MOB-018` | D | Patient Document Review & Discrepancy Flagging (`POST .../review`, `POST .../flags`) | `ORIGINAL_ONCOBRIEF` | `CORE` | M2 | P0 | `MOB-009` | Local-only `flag` action in `src/domain.ts:91` | `COMPLETE` |
| `REQ-MOB-019` | D | Missing-Document Checklist Synced from Clinician Tasks (`task.category = 'missing_document'`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M3 | P0 | `MOB-013` | Synced from clinician snapshot with upload fulfillment | `COMPLETE` |
| `REQ-MOB-020` | E | Verified Appointment Visibility & OPD Queue Status Card | `V4_ENHANCEMENT_PLAN` | `CORE` | M3 | P0 | `MOB-014` | Real OPD appointment cards with token and wait-time display | `COMPLETE` |
| `REQ-MOB-021` | E | Appointment Attendance Confirmation (`POST /api/v1/patient-portal/attendance`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M2 | P0 | `MOB-010` | Attendance confirm button and reschedule request workflow | `COMPLETE` |
| `REQ-MOB-022` | E | Chronological Oncology Care Journey Timeline (`getTimeline`) | `ORIGINAL_ONCOBRIEF` | `CORE` | M3 | P0 | `MOB-014` | Chronological care journey timeline with source provenance | `COMPLETE` |
| `REQ-MOB-023` | F | Clinician-Approved Continuity Message Feed (`continuity_message` inbox) | `ORIGINAL_ONCOBRIEF` | `CORE` | M3 | P0 | `MOB-015` | Approved message inbox with clinician attribution | `COMPLETE` |
| `REQ-MOB-024` | F | Optional Check `c4` Fix & Dedicated `packSelected` vs `shareSelected` State (`BUG-MOB-05`, `BUG-MOB-06`) | `MOBILE_EXTENSION` | `CORE` | M1 | P1 | `MOB-004` | `c4` dead; `state.selected` shared by Pack & Share | `COMPLETE` |
| `REQ-MOB-025` | F | Guided Consultation Preparation Sync (`PUT /api/v1/patient-portal/preparation`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M2 | P1 | `MOB-009` | Local-only preparation workspace | `COMPLETE` |
| `REQ-MOB-026` | F |Glossary-to-Question De-duplication & Direct Stage Routing (`BUG-MOB-11`) | `MOBILE_EXTENSION` | `EXTENDED` | M1 | P2 | `MOB-004` | Adds duplicates; routes to Stage 1 instead of Stage 2 | `COMPLETE` |
| `REQ-MOB-027` | F | Administrative Request to Hospital Coordinator (`POST /api/v1/patient-portal/requests`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M2 | P1 | `MOB-011` | Missing in `apps/mobile` | `COMPLETE` |
| `REQ-MOB-028` | F | Patient Consultation Packet Viewing & Scoped HTML/Print Export | `ORIGINAL_ONCOBRIEF` | `CORE` | M3 | P1 | `MOB-015` | Sanitized XSS-safe HTML export & text packet export | `COMPLETE` |
| `REQ-MOB-029` | G | UTF-8 Tamil String Repair (`BUG-MOB-01`) & Complete Bilingual Dictionary (`BUG-MOB-10`) | `OFFICIAL_HACKATHON` | `CORE` | M1 | P0 | `MOB-001` | Mojibake `"родрооро┐ро┤рпН"` in `profile.tsx:8`; missing keys | `COMPLETE` |
| `REQ-MOB-030` | G | Multilingual Voice Accessibility / Scoped TTS Playback (`POST /api/v1/patient-portal/voice-tts`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M3 | P0 | `MOB-016` | Bilingual voice player bar with scoped TTS and offline fallback | `COMPLETE` |
| `REQ-MOB-031` | G | Bilingual Localization of Oncology Seed Cohort, Stages & Instructions (`en` / `ta`) | `OFFICIAL_HACKATHON` | `CORE` | M1 | P1 | `MOB-003` | Static UI labels translated; content strings English-only | `COMPLETE` |
| `REQ-MOB-032` | H | Consented Caregiver Management UI & Backend Sync (`POST/PATCH/DELETE .../caregivers`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M3 | P0 | `MOB-017` | Caregiver management UI with scoped consent and instant revocation | `COMPLETE` |
| `REQ-MOB-033` | H | Time-Bounded & Revocable Consultation Share Grants (`POST/DELETE .../shares`) | `V4_ENHANCEMENT_PLAN` | `EXTENDED` | M3 | P1 | `MOB-017` | Time-bounded share grants with scoped records and instant revocation | `COMPLETE` |
| `REQ-MOB-034` | I | Encrypted At-Rest Storage via AES-256-GCM + `expo-secure-store` (`SEC-MOB-01`) & Web `localStorage` Fallback (`BUG-MOB-08`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M4 | P0 | `MOB-018` | AES-256-GCM authenticated envelope; zero plaintext PHI on disk; web localStorage fallback | `COMPLETE` |
| `REQ-MOB-035` | I | Explicit Informed Consent Gate on First Launch (`BUG-MOB-07`) & Revocation Wipe | `OFFICIAL_HACKATHON` | `CORE` | M1 | P0 | `MOB-004` | `app/index.tsx` auto-dispatches `onboard`, skipping screen | `COMPLETE` |
| `REQ-MOB-036` | I | Native Screen-Capture Protection (`FLAG_SECURE` / `expo-screen-capture`), App-Switcher Privacy Overlay & External URL Removal (`SEC-MOB-05`, `SEC-MOB-06`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M4 | P1 | `MOB-019` | PrivacyShieldBoundary AppState veil, FLAG_SECURE screen capture, zero external URL leaks | `COMPLETE` |
| `REQ-MOB-037` | I | Bounded Hash-Chained Local Audit Log & Debounced Draft Persistence (`SEC-MOB-07`, `BUG-MOB-13`) | `V4_ENHANCEMENT_PLAN` | `EXTENDED` | M4 | P1 | `MOB-018` | 250-entry cap with SHA-256 hash chain and 250ms useDraft debounce | `COMPLETE` |
| `REQ-MOB-038` | J | WCAG 2.2 AA Color Contrast Remediation (`BUG-MOB-12`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M1 | P1 | `MOB-005` | `c.teal` on `c.sage` = `4.37:1`; `c.line` = `1.22:1` | `COMPLETE` |
| `REQ-MOB-039` | J | Accessible SVG Charts (`accessibilityLabel`), `<KeyboardAvoidingView>` & Touch Target Compliance (`BUG-MOB-12`) | `V4_ENHANCEMENT_PLAN` | `CORE` | M1 | P1 | `MOB-005` | `accessible={false}` on all 4 charts; no keyboard avoidance | `COMPLETE` |
| `REQ-MOB-040` | K | Native Android Prebuild, Hermes Bundle & Debug/Release APK Generation (`assembleDebug`) | `OFFICIAL_HACKATHON` | `CORE` | M6 | P0 | `MOB-022` | Only JS/Web tested; no `android/` or `.apk` verified | `COMPLETE` |
| `REQ-MOB-041` | K | Native Android Emulator/Device Installation & Runtime Smoke Verification (`adb install` + Maestro) | `OFFICIAL_HACKATHON` | `CORE` | M6 | P0 | `MOB-023` | `0%` native runtime verification on branch | `COMPLETE` |
| `REQ-MOB-042` | L | ADR Numbering De-Confliction (`0017` → `0026`, `BUG-MOB-14`) & Git Worktree Isolation | `ORIGINAL_ONCOBRIEF` | `CORE` | M0 | P0 | `MOB-000` | Duplicate `0017` ADR number; dirty main worktree | `COMPLETE` |
| `REQ-MOB-043` | L | Comprehensive Unit, Component, Contract, RLS & Security Negative Test Suite | `V4_ENHANCEMENT_PLAN` | `CORE` | M5 | P0 | `MOB-020` | 103 mobile unit tests, 75 patient portal API tests, 20 security-negative tests | `COMPLETE` |
| `REQ-MOB-044` | L | Full Clinician-to-Patient E2E Continuity Playwright Suite | `V4_ENHANCEMENT_PLAN` | `CORE` | M5 | P0 | `MOB-021` | 9 Playwright E2E tests: 8 standalone mobile scenarios + 20-step connected loop | `COMPLETE` |
| `REQ-MOB-045` | L | Monorepo CI/CD Pipeline & Release Readiness Verification Gate | `V4_ENHANCEMENT_PLAN` | `CORE` | M7 | P1 | `MOB-024` | `apps/mobile` not wired into root verification gate | `NOT_STARTED` |

---

## 4. Detailed Requirement Specifications (`REQ-MOB-001` through `REQ-MOB-045`)

### Workstream A — Product Scope & Oncology Domain Alignment

#### `REQ-MOB-001` — Oncology Synthetic Demo Cohort Alignment (`DEMO-001`, `DEMO-002`, `DEMO-003`)
- **Product Objective:** Replace the generic primary-care mock records (`d1`–`d5`) with three realistic, synthetic oncology patient personas matching the OncoBrief clinician platform (`DEMO-001` Meenakshi Sundaram — Stage IIA ER+/PR+/HER2- Invasive Ductal Carcinoma of Left Breast on AC-T chemotherapy; `DEMO-002` Rajeshwari Nair — Stage IIIB High-Grade Serous Ovarian Carcinoma in interval debulking evaluation; `DEMO-003` Arjun Kulkarni — Stage IIIB Colon Adenocarcinoma on FOLFOX adjuvant surveillance).
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/src/seed.ts`, `docs/patient-continuity.md`
- **Requirement Authority:** `OFFICIAL_HACKATHON`
- **Classification:** `CORE`
- **Target User:** Patient / Consented Caregiver / Hackathon Demo Judge
- **User Story:** As a cancer patient or demo evaluator, I want the demo personas and records in the mobile app to reflect authentic oncology pathology, imaging, staging, chemotherapy lab panels, and discharge summaries that match the clinician dashboard.
- **Existing Implementation (`757f495`):** `apps/mobile/src/domain.ts:27-47` (`createDemo()`) seeds generic non-oncology records (`Comprehensive metabolic panel`, `Lipid panel`, `Primary care visit summary`, `Discharge instructions`, `Abdominal ultrasound summary`) with zero oncology documents (`BUG-MOB-02`).
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/src/domain.ts`, `apps/mobile/src/oncology-cohort.ts` (new), `apps/mobile/src/copy.ts`
- **API / Data Dependency:** Aligned with `patient` external IDs `DEMO-001`, `DEMO-002`, `DEMO-003` in `packages/db`.
- **Security Dependency:** Synthetic-only PII marker (`isSyntheticDemo: true`); zero real patient PHI.
- **Acceptance Criteria:**
  1. `createDemo('DEMO-001' | 'DEMO-002' | 'DEMO-003')` returns complete oncology records (Pathology/IHC, PET-CT/CT Chest-Abdomen-Pelvis, Pre-Cycle CBC/ANC/CMP, Chemo Cycle Summary, Surgical/Radiation Note).
  2. Persona selector in Demo Mode switches cleanly between `DEMO-001`, `DEMO-002`, and `DEMO-003`.
  3. All oncology terms in the glossary (`ANC`, `Hemoglobin`, `Platelets`, `Creatinine`, `CEA`, `CA-125`, `ER/PR/HER2`, `FOLFOX`, `AC-T`) provide non-diagnostic, factual source definitions in English and Tamil.
- **Unit Tests Required:** `apps/mobile/test/oncology-cohort.test.ts` (verifies all 3 personas, document types, provenance metadata, and bilingual strings).
- **Integration Tests Required:** Snapshot parity test comparing `createDemo('DEMO-001')` structure with `GET /api/v1/patient-portal/snapshot` payload for `DEMO-001`.
- **E2E / Native Tests Required:** Playwright E2E verifying persona switcher and oncology document rendering (`apps/mobile/e2e/patient-app.spec.ts`).
- **Milestone:** `M1` | **Priority:** `P0` | **Definition of Done:** Task `MOB-003` verified green.

#### `REQ-MOB-002` — Oncology Journey Stage & Cycle Ribbon on Home Dashboard
- **Product Objective:** Display the patient's current verified oncology care phase (e.g., `Neoadjuvant Chemotherapy — Cycle 3 of 4 (AC-T)`), next confirmed oncology appointment, and OPD token/queue status on the Home dashboard (`app/(tabs)/index.tsx`).
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `docs/patient-continuity.md`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Consented Caregiver
- **User Story:** As a patient undergoing multi-cycle cancer treatment, I want my Home screen to immediately show where I am in my verified treatment plan and when my next oncology clinic visit is scheduled.
- **Existing Implementation (`757f495`):** `app/(tabs)/index.tsx` displays only generic document count (`5 records`) and unverified count (`2 awaiting review`).
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/src/domain.ts`, `apps/mobile/src/copy.ts`
- **API / Data Dependency:** `GET /api/v1/patient-portal/snapshot` (`journeyStage`, `nextAppointment`, `readinessSummary`).
- **Security Dependency:** Displays only clinician-verified stage metadata with explicit source citation.
- **Acceptance Criteria:**
  1. Home screen renders the verified oncology treatment phase card with source citation badge.
  2. Home screen displays upcoming appointment card with quick attendance confirmation CTA (`Confirm Attendance` / `Request Reschedule`).
  3. Home screen displays active missing-document alert banner if any clinician `missing_document` task is open.
- **Unit Tests Required:** `apps/mobile/test/dashboard-selectors.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/snapshot/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E Home screen assertions (`apps/mobile/e2e/patient-app.spec.ts`).
- **Milestone:** `M1` (UI/Demo) & `M3` (Connected) | **Priority:** `P0` | **Definition of Done:** Task `MOB-003` & `MOB-014` verified green.

#### `REQ-MOB-003` — Consultation Readiness Score & Missing-Item Banner
- **Product Objective:** Surface the patient's consultation readiness status (e.g., `4 of 5 required documents ready — Waiting for Outside IHC Slide Block Report`) so patients arrive at oncology OPD with complete records.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver / OPD Coordinator
- **User Story:** As a patient preparing for an oncology consultation, I want to see which required reports are already verified and which missing reports I still need to upload before my appointment.
- **Existing Implementation (`757f495`):** Missing; only a static 4-item generic checklist exists.
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/src/preparation-workspace.tsx`, `apps/mobile/src/patient-selectors.ts`
- **API / Data Dependency:** `GET /api/v1/patient-portal/snapshot` (`missingDocumentTasks`, `readinessChecklist`).
- **Security Dependency:** Read-only reflection of authorized clinician task state.
- **Acceptance Criteria:**
  1. Home screen and Preparation screen display exact count of fulfilled vs open missing-document requests.
  2. Tapping a missing-document banner deep-links directly to `/import?taskId=<id>` pre-tagged with the requested document category.
- **Unit Tests Required:** `apps/mobile/test/readiness-selectors.test.ts`.
- **Integration Tests Required:** Task-to-upload linkage test in `apps/web/src/app/api/v1/patient-portal/documents/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E missing-document upload flow.
- **Milestone:** `M1` & `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-003` & `MOB-013` verified green.

#### `REQ-MOB-004` — Oncology-Specific Preparation Checklist & Question Prompts
- **Product Objective:** Provide oncology-appropriate consultation preparation steps (bring outside biopsy blocks/slides, pre-chemo CBC/ANC lab report, current supportive medications, symptom & side-effect diary, and oncology clinician questions).
- **Source Document:** `docs/patient-continuity.md`, `ONCOBRIEF_ENHANCEMENT_PLAN.md`
- **Requirement Authority:** `ORIGINAL_ONCOBRIEF`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver
- **User Story:** As a cancer patient preparing for my oncologist visit, I want an oncology-specific checklist and question builder so I do not forget critical pathology slides, pre-chemo labs, or questions about my treatment cycle.
- **Existing Implementation (`757f495`):** `src/domain.ts:51-54` has generic items (`Confirm records for the next visit`, `Review unverified uploads`, `Select two priority questions`, `Add personal notes`).
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/src/domain.ts`, `apps/mobile/src/oncology-cohort.ts`, `apps/mobile/src/preparation-workspace.tsx`
- **API / Data Dependency:** `PUT /api/v1/patient-portal/preparation`
- **Security Dependency:** Enforces clinical boundary check on patient-authored notes/questions (no AI generation of clinical advice).
- **Acceptance Criteria:**
  1. Checklist items cover oncology consultation readiness (pathology/IHC verification, pre-cycle lab upload, medication reconciliation, questions for oncologist, optional personal notes).
  2. Suggested question prompts are strictly non-diagnostic questions for the oncologist (e.g., `"What does this ANC value mean for my next scheduled cycle?"`, `"Do we need any additional slide review before starting treatment?"`).
- **Unit Tests Required:** `apps/mobile/test/oncology-cohort.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/preparation/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E preparation workflow.
- **Milestone:** `M1` | **Priority:** `P0` | **Definition of Done:** Task `MOB-003` verified green.

---

### Workstream B — Clinical-Safety Boundary & Non-Diagnostic Remediation

#### `REQ-MOB-005` — Lab Reference Interval Classification Removal (`BUG-MOB-04`)
- **Product Objective:** Eliminate all automated classification of laboratory values (`below` / `within` / `above`, `"Below supplied interval"`, `"Within supplied interval"`, `"Above supplied interval"`, and visual range-gauge position dots) so laboratory values are displayed strictly as verbatim numeric values alongside the printed reference string from the source report.
- **Source Document:** `docs/decisions/0001-clinical-boundary.md`, `packages/domain/src/policy/clinical-boundary.ts`
- **Requirement Authority:** `OFFICIAL_HACKATHON`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver / Clinical Governance Auditor
- **User Story:** As a clinical governance officer, I need the patient mobile app to display laboratory values and printed reference strings verbatim without computing or visually highlighting whether a result is high, low, normal, or abnormal.
- **Existing Implementation (`757f495`):** `apps/mobile/src/patient-selectors.ts:23-28` (`referencePosition`) computes `below | within | above`; `src/laboratory.tsx:10-16` (`ReferenceBar`) renders a visual position dot and status badge; `src/history-chart.tsx:16` shades reference range bands (`BUG-MOB-04`).
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/src/patient-selectors.ts`, `apps/mobile/src/laboratory.tsx`, `apps/mobile/src/history-chart.tsx`, `apps/mobile/src/copy.ts`
- **API / Data Dependency:** None (pure domain/presentation remediation).
- **Security Dependency:** Clinical safety policy enforcement (`packages/domain/src/policy/clinical-boundary.ts`).
- **Acceptance Criteria:**
  1. `referencePosition()` is removed from `apps/mobile/src/patient-selectors.ts`.
  2. `ReferenceBar` in `apps/mobile/src/laboratory.tsx` is replaced by a verbatim `PrintedSourceInterval` text row (`Printed reference interval on source report: 4.0–11.0 ×10³/µL`) with zero computed status badge (`below`/`within`/`above`) and zero gauge dot.
  3. `HistoryChart` in `apps/mobile/src/history-chart.tsx` plots chronological measured values and dates without shaded abnormal/normal classification bands.
  4. Every lab card includes the mandatory non-diagnostic provenance footer (`Values shown verbatim from source report. Discuss interpretation with your oncology team.`).
- **Unit Tests Required:** `apps/mobile/test/clinical-boundary-mobile.test.ts` (asserts `referencePosition` does not exist and lab rendering contains zero classification tokens).
- **Integration Tests Required:** `pnpm policy:check-clinical-boundary` passes across the entire monorepo including `apps/mobile`.
- **E2E / Native Tests Required:** Playwright E2E verifying lab detail cards and chronological charts render verbatim values and source strings without classification labels.
- **Milestone:** `M1` | **Priority:** `P0` | **Definition of Done:** Task `MOB-002` verified green.

#### `REQ-MOB-006` — CI Clinical Boundary Scanner Coverage for `apps/mobile` (`BUG-MOB-03`)
- **Product Objective:** Extend `tools/check-clinical-boundary.ts` so `apps/mobile/src` and `apps/mobile/app` are scanned alongside `packages/domain`, `packages/db`, `packages/adapters`, `apps/web`, and `apps/worker` on every CI run.
- **Source Document:** `tools/check-clinical-boundary.ts`, `docs/decisions/0001-clinical-boundary.md`
- **Requirement Authority:** `OFFICIAL_HACKATHON`
- **Classification:** `CORE`
- **Target User:** Engineering / Clinical Safety Auditor
- **User Story:** As a platform maintainer, I want `pnpm policy:check-clinical-boundary` to fail automatically if any file in `apps/mobile` introduces prohibited diagnostic, staging, risk-scoring, or lab-classification logic.
- **Existing Implementation (`757f495`):** `tools/check-clinical-boundary.ts:19-25` (`TARGET_DIRS`) lists only backend/web packages and omits `apps/mobile` (`BUG-MOB-03`).
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `tools/check-clinical-boundary.ts`, `apps/mobile/test/clinical-boundary-mobile.test.ts`
- **API / Data Dependency:** `@oncobrief/domain` clinical boundary policy.
- **Security Dependency:** Static analysis gate in CI.
- **Acceptance Criteria:**
  1. `TARGET_DIRS` in `tools/check-clinical-boundary.ts` includes `"apps/mobile/src"` and `"apps/mobile/app"`.
  2. Additional mobile-specific AST/regex rules detect lab range classification (`below supplied interval`, `above supplied interval`, `referencePosition`).
  3. `pnpm policy:check-clinical-boundary` exits `0` after `MOB-002` remediation and exits `1` when seeded with a synthetic violation fixture.
- **Unit Tests Required:** `apps/mobile/test/clinical-boundary-mobile.test.ts`.
- **Integration Tests Required:** Root `pnpm policy:check-clinical-boundary` execution.
- **E2E / Native Tests Required:** Included in CI pre-merge gate.
- **Milestone:** `M1` | **Priority:** `P0` | **Definition of Done:** Task `MOB-001` & `MOB-002` verified green.

#### `REQ-MOB-007` — Factual-Only Vital & Wellbeing Self-Log Without Scoring
- **Product Objective:** Retain the patient's ability to record personal self-reported check-in notes and vital measurements (`apps/mobile/app/(tabs)/care.tsx`, `app/vital/[id].tsx`) strictly as a personal, unmonitored diary for consultation discussion, with an explicit emergency/non-monitored disclaimer banner.
- **Source Document:** `docs/superpowers/plans/2026-10-29-patient-upgrade.md`, `docs/decisions/0001-clinical-boundary.md`
- **Requirement Authority:** `MOBILE_EXTENSION`
- **Classification:** `OPTIONAL`
- **Target User:** Patient
- **User Story:** As a patient tracking my daily temperature or weight at home between chemo cycles, I want to log my readings to show my doctor at the next visit while clearly understanding that the app does not monitor for emergencies or diagnose symptoms.
- **Existing Implementation (`757f495`):** `app/(tabs)/care.tsx` and `app/vital/[id].tsx` log entries locally without a prominent non-monitored emergency notice.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/app/(tabs)/care.tsx`, `apps/mobile/app/vital/[id].tsx`, `apps/mobile/src/copy.ts`
- **API / Data Dependency:** Optional inclusion in patient preparation notes (`PUT /api/v1/patient-portal/preparation`).
- **Security Dependency:** Encrypted local persistence; explicit non-monitored disclaimer.
- **Acceptance Criteria:**
  1. `care.tsx` and `vital/[id].tsx` display a high-contrast, bilingual non-monitored notice: `"Personal log for your next clinic visit only. Your care team does not monitor entries in real time. Contact your oncology clinic or emergency services directly for urgent symptoms (such as fever during chemotherapy)."`
  2. Zero automated symptom grading (no CTCAE grading, no red/yellow/green severity badges, no threshold alerts).
- **Unit Tests Required:** `apps/mobile/test/clinical-boundary-mobile.test.ts`.
- **Integration Tests Required:** None.
- **E2E / Native Tests Required:** Playwright E2E Care tab check.
- **Milestone:** `M1` | **Priority:** `P1` | **Definition of Done:** Task `MOB-002` verified green.

#### `REQ-MOB-008` — Prohibition of Autonomous Triage, Risk Scoring & Dosing Advice
- **Product Objective:** Explicitly reject and block any feature that performs symptom triage, fever risk stratification, chemotherapy dosing calculation, survival prognosis, or unapproved AI clinical summarization.
- **Source Document:** `docs/decisions/0001-clinical-boundary.md`, `packages/domain/src/policy/clinical-boundary.ts`
- **Requirement Authority:** `OFFICIAL_HACKATHON`
- **Classification:** `REJECTED_OUT_OF_SCOPE`
- **Target User:** All Users
- **User Story:** As a clinical safety lead, I require hard guarantees that the patient app never acts as a medical device or autonomous clinical advisor.
- **Existing Implementation (`757f495`):** Guarded only by local string regex in `apps/mobile/test/mobile-app.test.ts`.
- **Current Status:** `REJECTED_OUT_OF_SCOPE`
- **Exact Source Files:** `packages/domain/src/policy/clinical-boundary.ts`, `tools/check-clinical-boundary.ts`
- **API / Data Dependency:** Enforced on both client and server (`assertWithinClinicalBoundary`).
- **Security Dependency:** Server-side rejection (`422 CLINICAL_BOUNDARY_VIOLATION`) if any payload attempts to store prohibited clinical interpretation.
- **Acceptance Criteria:**
  1. All API endpoints and mobile reducers reject prohibited clinical interpretation strings.
- **Unit Tests Required:** `apps/mobile/test/clinical-boundary-mobile.test.ts`.
- **Integration Tests Required:** Negative API test sending prohibited strings.
- **E2E / Native Tests Required:** N/A (terminal guardrail).
- **Milestone:** `M1` | **Priority:** `P0` | **Definition of Done:** Task `MOB-001` verified green.

---

### Workstream C — Backend API Contracts, Database Schema, RLS & Repository Integration

#### `REQ-MOB-009` — Patient Portal Database Schema & RLS (`0022_patient_portal_foundation.sql`)
- **Product Objective:** Create the PostgreSQL schema and Row-Level Security (`ENABLE` + `FORCE ROW LEVEL SECURITY`) tables required for persistent, hospital-scoped patient mobile sessions, document reviews, discrepancy flags, consultation preparation workspaces, and revocable share grants.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/migrations/0002_rls.sql`, `0015_v4_1_continuity_and_appointments.sql`, `0021_v4_assessment_remediation.sql`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Clinician / Backend Platform
- **User Story:** As a backend architect, I need tenant-isolated, patient-scoped database tables so every action taken in the patient mobile app is durably stored, auditable, and visible to the oncology care team under strict RLS.
- **Existing Implementation (`757f495`):** Missing (`0` patient-portal tables in `packages/db/migrations`).
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `packages/db/migrations/0022_patient_portal_foundation.sql` (new), `packages/db/src/services/patient-portal.ts` (new), `packages/db/src/index.ts`
- **API / Data Dependency:** Depends on `hospital`, `patient`, `document`, `task`, `appointment`, `caregiver_contact`, `continuity_message`, and `audit_event` tables.
- **Security Dependency:** `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on all 5 new tables (`patient_portal_session`, `patient_document_review`, `patient_discrepancy_flag`, `patient_preparation_state`, `patient_share_grant`), scoped by `app.current_hospital_id()` and `current_setting('app.current_patient_id', true)`.
- **Acceptance Criteria:**
  1. Migration `0022_patient_portal_foundation.sql` applies cleanly on top of `0001`–`0021`.
  2. All 5 new tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
  3. Cross-patient and cross-hospital queries return `0` rows when `app.current_patient_id` or `app.current_hospital_id` differs.
- **Unit Tests Required:** Schema validation tests in `packages/db/test/patient-portal.test.ts`.
- **Integration Tests Required:** Live PostgreSQL RLS isolation tests in `packages/db/test/patient-portal-rls.test.ts`.
- **E2E / Native Tests Required:** Verified via full E2E continuity flow.
- **Milestone:** `M2` | **Priority:** `P0` | **Definition of Done:** Task `MOB-006` verified green.

#### `REQ-MOB-010` — Patient OTP/Session Authentication API (`POST/DELETE /api/v1/patient-portal/session`)
- **Product Objective:** Authenticate a patient or consented caregiver using hospital slug + patient identifier/MRN (`DEMO-001`..`003`) + 6-digit OTP verification code, issuing a cryptographically signed, short-lived bearer token bound to `(hospital_id, patient_id, actor_role, caregiver_contact_id)` and storing its SHA-256 hash in `patient_portal_session`.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `docs/patient-continuity.md`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Consented Caregiver
- **User Story:** As a patient or consented caregiver, I want to sign in securely to my hospital's OncoBrief portal so only I and my authorized family members can access my oncology records.
- **Existing Implementation (`757f495`):** `apps/mobile/app/signin.tsx` accepts any non-empty name and flips a local boolean `signedIn: true` with zero network or cryptographic verification (`SEC-MOB-02`).
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/session/route.ts` (new), `apps/web/src/lib/patient-session.ts` (new), `apps/mobile/app/signin.tsx`, `apps/mobile/src/api-client.ts` (new)
- **API / Data Dependency:** `patient_portal_session` table in `packages/db`.
- **Security Dependency:** Rate-limited OTP verification (`max 5 attempts / 15 min`), HMAC-SHA256 signed session token, server-side session revocation on `DELETE /api/v1/patient-portal/session`.
- **Acceptance Criteria:**
  1. `POST /api/v1/patient-portal/session` validates `(hospitalSlug, patientExternalId, otpCode, actorRole)` and returns `{ sessionToken, expiresAt, patientId, hospitalId, actorRole, scopes }`.
  2. Invalid OTP returns `401 Unauthorized`; brute-force attempts (>5) return `429 Too Many Requests`.
  3. `DELETE /api/v1/patient-portal/session` marks `revoked_at = NOW()` in `patient_portal_session` and invalidates the token immediately.
- **Unit Tests Required:** `apps/web/src/lib/patient-session.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/session/route.test.ts` (including `SEC-NEG-01`..`SEC-NEG-05`).
- **E2E / Native Tests Required:** Playwright E2E sign-in and sign-out flow.
- **Milestone:** `M2` | **Priority:** `P0` | **Definition of Done:** Task `MOB-007` verified green.

#### `REQ-MOB-011` — Patient Portal Snapshot API (`GET /api/v1/patient-portal/snapshot`)
- **Product Objective:** Provide a single, tenant-isolated, read-optimized aggregate endpoint returning the authenticated patient's verified profile summary, oncology journey stage, appointments (`listAppointments`), timeline events (`getTimeline`), authorized documents (`getPatient` + `patient_document_review` + `patient_discrepancy_flag`), open missing-document tasks (`listMyTasks` / `task.category = 'missing_document'`), clinician-approved continuity messages (`listMessages`), consented caregivers (`listCaregiverContacts`), consultation preparation state (`patient_preparation_state`), and active share grants (`patient_share_grant`).
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/src/services/patients.ts`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Consented Caregiver
- **User Story:** As a patient opening the mobile app, I want my app to load my complete, up-to-date oncology care snapshot from the hospital server in a single request and cache it safely for offline viewing.
- **Existing Implementation (`757f495`):** Missing (`0` API endpoints for mobile snapshot).
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/snapshot/route.ts` (new), `packages/db/src/services/patient-portal.ts` (new)
- **API / Data Dependency:** Reuses `getPatient`, `getTimeline`, `listAppointments`, `listMessages`, `listCaregiverContacts` in `@oncobrief/db`.
- **Security Dependency:** Requires valid bearer token from `requirePatientPortalSession(request)`; filters out unapproved drafts (`continuity_message.status` must be `'approved'` or `'dispatched'` or `'delivered'`), hides internal clinician-only notes, and respects caregiver `consent_scopes` when `actorRole === 'caregiver'`.
- **Acceptance Criteria:**
  1. Authenticated patient receives HTTP `200` with complete typed `PatientPortalSnapshot` payload and `ETag` / `syncedAt` cursor.
  2. Unapproved continuity messages (`status = 'draft'` or `'pending_approval'`) are never included in the response.
  3. Caregiver session with limited scopes (e.g., `['appointments', 'reminders']`) has `documents` and `preparation` redacted according to granted scopes.
- **Unit Tests Required:** Snapshot serializer unit tests.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/snapshot/route.test.ts` (including caregiver scope filtering and unapproved draft exclusion).
- **E2E / Native Tests Required:** Playwright E2E connected mode sync.
- **Milestone:** `M2` | **Priority:** `P0` | **Definition of Done:** Task `MOB-008` verified green.

#### `REQ-MOB-012` — Hybrid Repository Architecture (`ConnectedPatientRepository` + `DemoRepository` + `OfflineSyncQueue`)
- **Product Objective:** Upgrade `apps/mobile/src/repository.ts` and `src/store.tsx` so the mobile app supports two explicit, visually badged operating modes: **Connected Hospital Mode** (live REST sync with `/api/v1/patient-portal/*` + encrypted offline cache + persistent mutation outbox queue) and **Offline Synthetic Demo Mode** (`DEMO-001`..`003` oncology cohort for offline hackathon judging).
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `docs/decisions/0026-patient-mobile-architecture.md` (renumbered from 0018 due to existing 0018-0025 ADRs)
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Hackathon Judge
- **User Story:** As a patient with intermittent clinic Wi-Fi or cellular connectivity, I want my app to display my cached records offline, queue my checklist edits or attendance confirmations while offline, and sync automatically when connectivity returns—while clearly showing whether I am in Connected Hospital Mode or Synthetic Demo Mode.
- **Existing Implementation (`757f495`):** `apps/mobile/src/repository.ts` implements only local `DemoRepository`.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/src/repository.ts`, `apps/mobile/src/api-client.ts` (new), `apps/mobile/src/sync-queue.ts` (new), `apps/mobile/src/store.tsx`
- **API / Data Dependency:** All `/api/v1/patient-portal/*` endpoints.
- **Security Dependency:** Outbox queue encrypted at rest (`REQ-MOB-034`); wiped on session logout or consent revocation.
- **Acceptance Criteria:**
  1. App header displays explicit mode badge: `Connected • Hospital Sync` (with last-synced timestamp) or `Synthetic Oncology Demo • Offline`.
  2. Mutations performed while offline in Connected Mode are appended to `OfflineSyncQueue` with idempotency keys (`X-Idempotency-Key`) and flushed FIFO upon reconnect.
  3. Switching from Connected Mode to Demo Mode or signing out clears all cached connected patient state.
- **Unit Tests Required:** `apps/mobile/test/sync-queue.test.ts`, `apps/mobile/test/connected-repository.test.ts`.
- **Integration Tests Required:** Offline-to-online replay test against mock/live Next.js route handlers.
- **E2E / Native Tests Required:** Playwright E2E offline mutation + reconnect flush test.
- **Milestone:** `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-012` verified green.

---

### Workstream D — Document Vault, Upload, Provenance, Review & Discrepancy Workflow

#### `REQ-MOB-013` — Source-Backed Oncology Document Vault & Provenance Badges
- **Product Objective:** Display the patient's oncology documents (`pathology`, `imaging`, `lab`, `discharge`, `operative`, `chemotherapy`, `radiation`, `patient_upload`) with clear, distinct badges separating **Clinician Verification Status** (`Clinician Verified`, `Pending Clinician Review`, `Ingestion Processing`) from **Patient Review Status** (`Confirmed by You`, `Discrepancy Flagged by You`, `Unread by You`).
- **Source Document:** `README.md`, `docs/patient-continuity.md`, `ONCOBRIEF_ENHANCEMENT_PLAN.md`
- **Requirement Authority:** `ORIGINAL_ONCOBRIEF`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver / Clinician
- **User Story:** As a patient viewing my oncology records, I want to clearly distinguish whether a document has been verified by my oncology care team versus whether I have personally reviewed it for accuracy.
- **Existing Implementation (`757f495`):** `apps/mobile/src/domain.ts:9` uses a single `review: 'reviewed' | 'unreviewed' | 'flagged'` field that conflates clinician verification with patient review (`app/record/[id].tsx:27`).
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/src/domain.ts`, `apps/mobile/app/(tabs)/records.tsx`, `apps/mobile/app/record/[id].tsx`, `apps/mobile/src/copy.ts`
- **API / Data Dependency:** `GET /api/v1/patient-portal/snapshot` (`documents[].clinicianVerificationStatus`, `documents[].patientReviewStatus`).
- **Security Dependency:** Patient actions can NEVER mutate `clinicianVerificationStatus` (`REQ-MOB-017`).
- **Acceptance Criteria:**
  1. `RecordItem` model separates `clinicianStatus: 'verified' | 'pending_clinician_review' | 'processing'` from `patientReview: 'unreviewed' | 'confirmed_by_patient' | 'discrepancy_flagged'`.
  2. Every document detail screen displays source facility, document date, page count, SHA-256 integrity prefix, and verbatim extracted facts with page/span citation badges.
- **Unit Tests Required:** `apps/mobile/test/document-provenance.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/documents/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E Records vault and detail inspection.
- **Milestone:** `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-013` verified green.

#### `REQ-MOB-014` — Authorized Document Page Viewer (`GET /api/v1/patient-portal/documents/[documentId]/pages/[pageNumber]`)
- **Product Objective:** Allow authenticated patients to view the normalized source page text and/or source document attachment for their own authorized oncology records directly inside `app/record/[id].tsx`.
- **Source Document:** `docs/patient-continuity.md`, `packages/db/src/services/patients.ts` (`getDocument`, `getPageSpans`)
- **Requirement Authority:** `ORIGINAL_ONCOBRIEF`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver
- **User Story:** As a patient checking a pathology or lab finding in my app, I want to inspect the underlying source page and highlighted span from the hospital record so I can verify the exact wording and date.
- **Existing Implementation (`757f495`):** `app/record/[id].tsx` only renders static summary strings and local sample asset URIs.
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/documents/[documentId]/pages/[pageNumber]/route.ts` (new), `apps/mobile/app/record/[id].tsx`
- **API / Data Dependency:** `getDocument` and `getPageSpans` in `packages/db/src/services/patients.ts`.
- **Security Dependency:** Enforces tenant + patient ownership (`document.patient_id === session.patientId`) and sets `Cache-Control: private, no-store`.
- **Acceptance Criteria:**
  1. `GET /api/v1/patient-portal/documents/[documentId]/pages/[pageNumber]` returns the page text, spans, and signed/proxied media metadata for the patient's own document.
  2. Requesting a `documentId` belonging to another patient returns HTTP `404 Not Found` (`SEC-NEG-06`).
- **Unit Tests Required:** Route parameter and ownership guard unit tests.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/documents/[documentId]/pages/[pageNumber]/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E source page inspection in `app/record/[id].tsx`.
- **Milestone:** `M2` & `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-008` & `MOB-013` verified green.

#### `REQ-MOB-015` — Patient Document Upload to Backend (`POST /api/v1/patient-portal/documents`)
- **Product Objective:** Enable patients to upload external oncology PDFs or report photos (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`, ≤ 10 MB) directly to the OncoBrief backend via `reserveDocumentForUpload`, `sniffContentType`, and `ingestDocument`, optionally linking the upload to an open `missing_document` task.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/src/services/documents.ts`
- **Requirement Authority:** `ORIGINAL_ONCOBRIEF`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver
- **User Story:** As a patient who had a blood test or biopsy at an outside diagnostic center, I want to upload the PDF or photo from my phone so my oncology team can review it before my appointment.
- **Existing Implementation (`757f495`):** `apps/mobile/app/import.tsx` copies files only to local sandbox storage with zero backend upload.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/documents/route.ts` (new), `apps/mobile/app/import.tsx`, `apps/mobile/src/file-validation.ts`
- **API / Data Dependency:** `reserveDocumentForUpload`, `sniffContentType`, `ingestDocument`, `detectNearDuplicates`, and `commentTask` in `@oncobrief/db`.
- **Security Dependency:** Server-side magic-byte sniffing (`sniffContentType` rejects spoofed MIME types), 10 MB payload limit, SHA-256 content hash deduplication, and `source_Reliability = 'patient_reported'` tagging.
- **Acceptance Criteria:**
  1. Uploading a valid PDF/JPEG/PNG/WebP creates a `document` row (`source = 'patient_upload'`, `status = 'uploaded'`/`'ingested'`) and records an `audit_event`.
  2. Spoofed executables or HTML disguised as `.pdf` or `.png` are rejected with HTTP `415 Unsupported Media Type` (`SEC-NEG-08`).
  3. If `fulfillsTaskId` is passed, a task comment is appended to the clinician's `missing_document` task notifying the coordinator that the patient uploaded a candidate file.
- **Unit Tests Required:** `apps/mobile/test/file-validation.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/documents/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E upload + clinician visibility test.
- **Milestone:** `M2` & `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-009` & `MOB-013` verified green.

#### `REQ-MOB-016` — Transactional Local File Import, Date Fallback & SHA-256 Deduplication (`BUG-MOB-09`)
- **Product Objective:** Fix `apps/mobile/app/import.tsx` so local file retention (`retainSample`) never leaves orphaned files on disk if validation/dispatch fails, defaults missing document dates to today's ISO date (`YYYY-MM-DD`) labeled `(Upload date)` rather than blank `''` (`Date not supplied`), and prevents duplicate imports of identical file content via SHA-256 hashing.
- **Source Document:** Branch Audit `BUG-MOB-09`, `SEC-MOB-03`
- **Requirement Authority:** `MOBILE_EXTENSION`
- **Classification:** `CORE`
- **Target User:** Patient
- **User Story:** As a patient importing a document on my phone, I want clear feedback if I accidentally pick the same file twice, a sensible upload date if I leave the date field blank, and no leftover files cluttering my phone if an import is cancelled or fails.
- **Existing Implementation (`757f495`):** `app/import.tsx:32-33` calls `retainSample` before `dispatch` without cleanup on error, sets `date: ''`, and has no duplicate hash check (`BUG-MOB-09`).
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/app/import.tsx`, `apps/mobile/src/file-validation.ts`, `apps/mobile/src/domain.ts`
- **API / Data Dependency:** Local file system + `state.records` SHA-256 index.
- **Security Dependency:** Prevents sandbox storage exhaustion and orphan PHI files (`SEC-MOB-03`).
- **Acceptance Criteria:**
  1. Validation (title non-empty, MIME magic bytes, size ≤ 10 MB, SHA-256 not already in `state.records`) runs BEFORE `retainSample` copies bytes to durable storage; if downstream persistence fails, the copied file is deleted in a `catch` rollback block.
  2. Leaving the date field empty defaults to `new Date().toISOString().slice(0, 10)` with `dateSource: 'upload_date'`.
  3. Importing an identical file twice displays a clear bilingual duplicate warning and does not create a second record.
- **Unit Tests Required:** `apps/mobile/test/import-transactional.test.ts`.
- **Integration Tests Required:** Verified in `MOB-009` upload integration test.
- **E2E / Native Tests Required:** Playwright E2E import test (`apps/mobile/e2e/patient-app.spec.ts`).
- **Milestone:** `M1` | **Priority:** `P1` | **Definition of Done:** Task `MOB-004` verified green.

#### `REQ-MOB-017` — Document Ingestion Status & Verification Badge Lifecycle
- **Product Objective:** Enforce a strict state boundary where patient-uploaded documents start as `clinicianStatus: 'pending_clinician_review'` and can only transition to `clinicianStatus: 'verified'` through clinician action on the web platform (`confirmDocumentType` / clinician sign-off), never through patient review on mobile.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `docs/patient-continuity.md`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Clinician
- **User Story:** As an oncologist, I need complete assurance that when a patient taps "Confirm details match my report" on their phone, it records the patient's confirmation without marking an unverified upload as Clinician Verified.
- **Existing Implementation (`757f495`):** `src/domain.ts:91` (`review` action) flips `review: 'reviewed'`, which UI badges display identically to verified hospital records.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/src/domain.ts`, `apps/mobile/app/record/[id].tsx`, `packages/db/src/services/patient-portal.ts`
- **API / Data Dependency:** `POST /api/v1/patient-portal/documents/[documentId]/review`
- **Security Dependency:** Server-side invariant: `recordPatientDocumentReview` writes only to `patient_document_review` and NEVER mutates `document.status` or `clinical_fact.verification_status`.
- **Acceptance Criteria:**
  1. Tapping `Confirm details` in `app/record/[id].tsx` sets `patientReview = 'confirmed_by_patient'` while preserving `clinicianStatus = 'pending_clinician_review'` (if uploaded) or `'verified'` (if hospital-verified).
  2. Server integration test verifies `document.status` is unchanged after `POST /api/v1/patient-portal/documents/[documentId]/review`.
- **Unit Tests Required:** `apps/mobile/test/document-provenance.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/documents/[documentId]/review/route.test.ts` (`SEC-NEG-10`).
- **E2E / Native Tests Required:** Playwright E2E review lifecycle test.
- **Milestone:** `M2` & `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-009` & `MOB-013` verified green.

#### `REQ-MOB-018` — Patient Document Review & Discrepancy Flagging (`POST .../review`, `POST .../flags`)
- **Product Objective:** Allow a patient to flag a factual discrepancy on any document or timeline item (e.g., wrong collection date, typo in outside lab name, missing page) via `POST /api/v1/patient-portal/flags`, automatically creating both a `patient_discrepancy_flag` row and a linked clinician review `task` (`category = 'reconciliation'`) in `@oncobrief/db`.
- **Source Document:** `docs/patient-continuity.md`, `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/src/services/tasks.ts`
- **Requirement Authority:** `ORIGINAL_ONCOBRIEF`
- **Classification:** `CORE`
- **Target User:** Patient / Clinician / OPD Coordinator
- **User Story:** As a patient who notices an incorrect date or hospital name on an imported summary, I want to flag the discrepancy from my phone so a reconciliation task immediately appears in my care team's queue.
- **Existing Implementation (`757f495`):** `app/record/[id].tsx:28` updates a local string in `state.records` with zero backend persistence or clinician task creation.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/flags/route.ts` (new), `packages/db/src/services/patient-portal.ts`, `apps/mobile/app/record/[id].tsx`
- **API / Data Dependency:** `patient_discrepancy_flag` table + `task` table (`packages/db/src/services/tasks.ts`).
- **Security Dependency:** Clinical boundary check on reason string; rate limit on open flags per document; audit event logged.
- **Acceptance Criteria:**
  1. Submitting a discrepancy flag in `app/record/[id].tsx` persists a `patient_discrepancy_flag` row (`status = 'open'`) and creates a linked `task` row (`category = 'reconciliation'`, `status = 'open'`) visible in the clinician web app.
  2. When a clinician resolves the flag/task, the mobile app displays `Flag resolved by care team` with the resolution timestamp.
- **Unit Tests Required:** Reducer and payload validation tests.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/flags/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E patient-flag-to-clinician-task test.
- **Milestone:** `M2` & `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-009` & `MOB-013` verified green.

#### `REQ-MOB-019` — Missing-Document Checklist Synced from Clinician Tasks (`task.category = 'missing_document'`)
- **Product Objective:** Surface open clinician tasks with `category = 'missing_document'` (created via `packages/db/src/services/tasks.ts`) as actionable "Requested by Your Care Team" upload cards in the mobile app.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/src/services/tasks.ts`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver / OPD Coordinator
- **User Story:** As an oncology coordinator, when I create a "Missing Document" task for an outside histopathology slide report, I want the patient to see that exact request on their phone and upload the document directly against that request.
- **Existing Implementation (`757f495`):** Missing in `apps/mobile`.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `packages/db/src/services/patient-portal.ts`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/records.tsx`, `apps/mobile/app/import.tsx`
- **API / Data Dependency:** `GET /api/v1/patient-portal/snapshot` (`missingDocumentRequests`) and `POST /api/v1/patient-portal/documents` (`fulfillsTaskId`).
- **Security Dependency:** Exposes only patient-facing task title, requested document category, and due date; internal clinician task comments remain private.
- **Acceptance Criteria:**
  1. Open `missing_document` tasks for the patient appear on the Home dashboard and Records screen.
  2. Uploading a document linked to `fulfillsTaskId` transitions the mobile request badge to `Uploaded — Pending Coordinator Verification` and appends a structured comment on the backend task.
- **Unit Tests Required:** `apps/mobile/test/readiness-selectors.test.ts`.
- **Integration Tests Required:** `packages/db/test/patient-portal.test.ts`.
- **E2E / Native Tests Required:** Step 9–12 of the 20-step E2E scenario.
- **Milestone:** `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-013` verified green.

---

### Workstream E — Appointments, Attendance Confirmation, OPD Queue & Care Journey Timeline

#### `REQ-MOB-020` — Verified Appointment Visibility & OPD Queue Status Card
- **Product Objective:** Display the patient's scheduled, confirmed, checked-in, or rescheduled oncology appointments from the `appointment` and `clinic_session` tables (`packages/db/src/services/appointments.ts`), including clinic location, department, token number, and administrative OPD status.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/src/services/appointments.ts`, `migrations/0015_v4_1_continuity_and_appointments.sql`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver
- **User Story:** As a patient visiting the oncology OPD, I want to see my verified appointment date, time window, clinic room/department, and check-in/token status on my phone.
- **Existing Implementation (`757f495`):** Only a single unverified free-text string `state.visit.date = '14 Nov, 09:30'` exists in `src/domain.ts:50`.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/src/domain.ts`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/care.tsx`
- **API / Data Dependency:** `listAppointments` in `packages/db/src/services/appointments.ts` via `GET /api/v1/patient-portal/snapshot`.
- **Security Dependency:** Read-only projection of patient's own `appointment` rows.
- **Acceptance Criteria:**
  1. Appointments list displays status (`scheduled`, `confirmed`, `checked_in`, `in_consultation`, `completed`, `reschedule_requested`), scheduled timestamp, department, and OPD instructions.
  2. Any status update performed by the coordinator in the web app (`changeAppointmentStatus`) is reflected in the mobile app upon refresh.
- **Unit Tests Required:** `apps/mobile/test/appointments-timeline.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/snapshot/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E appointment card & status sync test.
- **Milestone:** `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-014` verified green.

#### `REQ-MOB-021` — Appointment Attendance Confirmation (`POST /api/v1/patient-portal/attendance`)
- **Product Objective:** Allow a patient or consented caregiver with `appointments` scope to confirm attendance (`action: 'confirm'`) or request a reschedule (`action: 'request_reschedule'`) for an upcoming appointment, invoking `changeAppointmentStatus` in `packages/db/src/services/appointments.ts` and writing to `appointment_status_history`.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/src/services/appointments.ts`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Consented Caregiver / OPD Coordinator
- **User Story:** As a patient with an upcoming oncology OPD slot, I want to tap "Confirm I Will Attend" or "Request New Date" in the mobile app so the clinic coordinator knows my attendance status in advance.
- **Existing Implementation (`757f495`):** Missing in `apps/mobile`.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/attendance/route.ts` (new), `packages/db/src/services/patient-portal.ts`, `apps/mobile/app/(tabs)/index.tsx`
- **API / Data Dependency:** `changeAppointmentStatus` in `packages/db/src/services/appointments.ts`.
- **Security Dependency:** Validates that `appointment.patient_id === session.patientId` and only allows patient-permitted transitions (`scheduled -> confirmed` or creation of a coordinator reschedule task).
- **Acceptance Criteria:**
  1. Confirming attendance on a `scheduled` appointment transitions `appointment.status` to `'confirmed'`, appends an `appointment_status_history` record, and updates the mobile UI badge to `Attendance Confirmed`.
  2. Requesting a reschedule creates a coordinator administrative task (`category = 'scheduling'`) with the patient's preferred date window and note.
- **Unit Tests Required:** Attendance reducer and payload tests.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/attendance/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E attendance confirmation test.
- **Milestone:** `M2` & `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-010` & `MOB-014` verified green.

#### `REQ-MOB-022` — Chronological Oncology Care Journey Timeline (`getTimeline`)
- **Product Objective:** Provide a source-grounded chronological Care Journey Timeline inside the mobile app displaying verified oncology milestones (Initial Diagnosis/Biopsy, Staging Imaging, Multidisciplinary Tumor Board / Surgical Note, Chemo Cycle 1..N, Lab Panels, Upcoming Consultation) backed by `getTimeline` in `packages/db/src/services/patients.ts`.
- **Source Document:** `README.md`, `docs/patient-continuity.md`, `packages/db/src/services/patients.ts`
- **Requirement Authority:** `ORIGINAL_ONCOBRIEF`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver
- **User Story:** As a cancer patient with months of reports across multiple hospitals, I want a chronological timeline of my verified cancer care events so I can understand the sequence of my biopsies, scans, and chemotherapy cycles and tap any event to open its source report.
- **Existing Implementation (`757f495`):** Missing; `app/(tabs)/records.tsx` is a flat list of documents without a chronological care-event timeline.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/app/(tabs)/care.tsx`, `apps/mobile/src/timeline-view.tsx` (new), `apps/mobile/src/domain.ts`
- **API / Data Dependency:** `getTimeline` in `packages/db/src/services/patients.ts` via `GET /api/v1/patient-portal/snapshot`.
- **Security Dependency:** Displays only source-linked timeline events with explicit provenance badges.
- **Acceptance Criteria:**
  1. Timeline renders events in reverse-chronological or chronological order with category filter chips (`All`, `Pathology & Biopsy`, `Imaging`, `Systemic Therapy / Chemo`, `Labs`, `Clinic Visits`).
  2. Every timeline card displays a clickable source citation badge (`Source: Apollo Specialty Hospital Pathology Report • 12 Oct 2026, p. 1`) that navigates directly to `/record/[documentId]`.
- **Unit Tests Required:** `apps/mobile/test/appointments-timeline.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/snapshot/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E timeline navigation test.
- **Milestone:** `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-014` verified green.

---

### Workstream F — Consultation Preparation, Approved Reminders, Coordinator Requests & Packet Export

#### `REQ-MOB-023` — Clinician-Approved Continuity Message Feed (`continuity_message` Inbox)
- **Product Objective:** Display clinician-approved continuity messages, pre-visit instructions, and medication/fasting reminders from the `continuity_message` table (`packages/db/src/services/messages.ts`) in the mobile app (`Home` & `Prepare` tabs), with one-tap acknowledgment and bilingual display (`en` / `ta`).
- **Source Document:** `docs/patient-continuity.md`, `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/src/services/messages.ts`
- **Requirement Authority:** `ORIGINAL_ONCOBRIEF`
- **Classification:** `CORE`
- **Target User:** Patient / Consented Caregiver
- **User Story:** As a patient, I want to read verified pre-consultation instructions and post-visit reminders approved by my oncologist directly in my mobile app in English or Tamil.
- **Existing Implementation (`757f495`):** Missing in `apps/mobile`.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/src/preparation-workspace.tsx`, `apps/mobile/src/domain.ts`
- **API / Data Dependency:** `listMessages` in `packages/db/src/services/patients.ts` and `packages/db/src/services/messages.ts`.
- **Security Dependency:** Server strictly filters `status IN ('approved', 'dispatched', 'delivered')` so unapproved drafts are never exposed (`SEC-NEG-11`).
- **Acceptance Criteria:**
  1. Approved continuity messages render with approving clinician name, approval timestamp, language tag (`en`/`ta`), and linked source document badges.
  2. Each approved message includes a `Listen (Audio)` button wired to Workstream G (`REQ-MOB-030`).
- **Unit Tests Required:** `apps/mobile/test/continuity-messages.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/snapshot/route.test.ts`.
- **E2E / Native Tests Required:** Step 13–15 of the 20-step E2E scenario.
- **Milestone:** `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-015` verified green.

#### `REQ-MOB-024` — Optional Check `c4` Fix & Dedicated `packSelected` vs `shareSelected` State (`BUG-MOB-05`, `BUG-MOB-06`)
- **Product Objective:** Fix the two state bugs in `apps/mobile`: (1) allow optional checklist items (`c4: Add personal notes`) to be checked and counted when enabled (`BUG-MOB-06`), and (2) decouple `state.packSelected` (records included in the Consultation Pack) from `state.shareSelected` (records included in a Caregiver/Provider Share Grant) so modifying one never corrupts the other (`BUG-MOB-05`).
- **Source Document:** Branch Audit `BUG-MOB-05`, `BUG-MOB-06`
- **Requirement Authority:** `MOBILE_EXTENSION`
- **Classification:** `CORE`
- **Target User:** Patient
- **User Story:** As a patient, I want to check off my optional personal-notes step once I enable it, and I want to choose which records to share with a family member without accidentally changing the documents in my doctor's consultation pack.
- **Existing Implementation (`757f495`):** `src/preparation-workspace.tsx:24` filters `state.checks.filter(c => c.enabled && !c.optional)` (making `c4` permanently uncheckable), and both `src/preparation-workspace.tsx:33` and `app/sharing.tsx:9` mutate `state.selected`.
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/src/domain.ts`, `apps/mobile/src/preparation-workspace.tsx`, `apps/mobile/app/sharing.tsx`, `apps/mobile/src/export.ts`
- **API / Data Dependency:** Backward-compatible migration of persisted `state.selected` into `packSelected` and `shareSelected`.
- **Security Dependency:** Prevents unintended over-sharing of records when configuring caregiver shares (`SEC-MOB-04`).
- **Acceptance Criteria:**
  1. Enabling `c4` (`toggleOptional`) makes `c4` visible and checkable (`toggleCheck('c4')` toggles `c4.done`).
  2. Toggling a record in `/sharing` mutates `state.shareSelected` and leaves `state.packSelected` untouched.
  3. Toggling a record in `/prepare` Stage 3 (`pack`) mutates `state.packSelected` and leaves `state.shareSelected` untouched.
- **Unit Tests Required:** `apps/mobile/test/preparation-sharing-isolation.test.ts`.
- **Integration Tests Required:** Verified via preparation & share API sync tests.
- **E2E / Native Tests Required:** Playwright E2E preparation and sharing tests.
- **Milestone:** `M1` | **Priority:** `P1` | **Definition of Done:** Task `MOB-004` verified green.

#### `REQ-MOB-025` — Guided Consultation Preparation Sync (`PUT /api/v1/patient-portal/preparation`)
- **Product Objective:** Persist the patient's consultation checklist state, prioritized questions for the oncologist, personal symptom/medication notes, and selected consultation pack document IDs to `patient_preparation_state` so the clinician can view the patient's pre-visit questions and readiness before the consultation starts.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `docs/patient-continuity.md`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Oncologist
- **User Story:** As a patient who spent time writing down my top questions and medication list before my oncology visit, I want my preparation pack synced to my hospital record so my oncologist sees my priority questions on their consultation screen.
- **Existing Implementation (`757f495`):** Stored only in local device state (`state.checks`, `state.questions`, `state.visit.notes`).
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/preparation/route.ts` (new), `packages/db/src/services/patient-portal.ts`, `apps/mobile/src/preparation-workspace.tsx`
- **API / Data Dependency:** `patient_preparation_state` table in `packages/db`.
- **Security Dependency:** Enforces clinical boundary check and payload size bounds (`max 20 questions`, `notes <= 4000 chars`).
- **Acceptance Criteria:**
  1. `PUT /api/v1/patient-portal/preparation` upserts `patient_preparation_state` for `(hospital_id, patient_id)` and returns `updatedAt`.
  2. Reloading the mobile app on a fresh browser/device session restores the exact checklist, questions, and pack selection from `GET /api/v1/patient-portal/snapshot`.
- **Unit Tests Required:** Preparation state validation tests.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/preparation/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E preparation sync test.
- **Milestone:** `M2` & `M3` | **Priority:** `P1` | **Definition of Done:** Task `MOB-009` & `MOB-015` verified green.

#### `REQ-MOB-026` — Glossary-to-Question De-duplication & Direct Stage Routing (`BUG-MOB-11`)
- **Product Objective:** Fix `glossaryToQuestion` in `apps/mobile/app/record/[id].tsx:21` so tapping "Add to visit questions" on a glossary term does not insert duplicate questions on repeated taps and navigates directly to `/prepare?stage=questions` (Stage 2) instead of always landing on Stage 1 (`checklist`).
- **Source Document:** Branch Audit `BUG-MOB-11`
- **Requirement Authority:** `MOBILE_EXTENSION`
- **Classification:** `EXTENDED`
- **Target User:** Patient
- **User Story:** As a patient tapping a medical term in my pathology report to ask my doctor about it, I want to be taken directly to my Questions list without adding duplicate questions if I tap the button twice.
- **Existing Implementation (`757f495`):** `src/domain.ts:95` (`addQuestion`) blindly prepends duplicates, and `app/record/[id].tsx:21` calls `router.push('/prepare')` which hardcodes `useState<Stage>('checklist')`.
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/src/domain.ts`, `apps/mobile/app/record/[id].tsx`, `apps/mobile/src/preparation-workspace.tsx`, `apps/mobile/app/(tabs)/prepare.tsx`
- **API / Data Dependency:** None.
- **Security Dependency:** None.
- **Acceptance Criteria:**
  1. `addQuestion` normalizes whitespace/case and is idempotent if an identical question text already exists in `state.questions`.
  2. `PreparationWorkspace` reads optional `stage` query parameter (`checklist | questions | pack`) via `useLocalSearchParams`.
  3. Tapping `Add to visit questions` on a glossary chip navigates to `/prepare?stage=questions` with Stage 2 active.
- **Unit Tests Required:** `apps/mobile/test/preparation-sharing-isolation.test.ts`.
- **Integration Tests Required:** None.
- **E2E / Native Tests Required:** Playwright E2E glossary-to-question flow.
- **Milestone:** `M1` | **Priority:** `P2` | **Definition of Done:** Task `MOB-004` verified green.

#### `REQ-MOB-027` — Administrative Request to Hospital Coordinator (`POST /api/v1/patient-portal/requests`)
- **Product Objective:** Allow patients or consented caregivers to submit structured administrative requests to the hospital oncology coordinator (e.g., request medical certificate/insurance summary, request outside slide return, report scheduling constraint, request translator assistance), creating an auditable `task` row (`packages/db/src/services/tasks.ts`) for the coordinator queue.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/src/services/tasks.ts`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver / OPD Coordinator
- **User Story:** As a patient who needs administrative help from the oncology coordinator (such as scheduling coordination or insurance record copies), I want to send a structured non-clinical administrative request from my phone and track whether the coordinator has seen it.
- **Existing Implementation (`757f495`):** Missing in `apps/mobile`.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/requests/route.ts` (new), `packages/db/src/services/patient-portal.ts`, `apps/mobile/app/(tabs)/care.tsx`
- **API / Data Dependency:** `task` table in `packages/db`.
- **Security Dependency:** Explicit non-emergency banner before submission (`For administrative coordination only. Never use for urgent medical symptoms.`); rate-limited (`max 10 open requests per patient`).
- **Acceptance Criteria:**
  1. Submitting a coordinator request creates a `task` row (`category = 'follow_up' | 'scheduling' | 'administrative'`) linked to `patient_id` and displays in the mobile app's `Coordinator Requests` list with live status (`Open`, `In Progress`, `Completed`).
- **Unit Tests Required:** Request validation and reducer tests.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/requests/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E coordinator request test.
- **Milestone:** `M2` & `M3` | **Priority:** `P1` | **Definition of Done:** Task `MOB-011` & `MOB-015` verified green.

#### `REQ-MOB-028` — Patient Consultation Packet Viewing & Scoped HTML/Print Export
- **Product Objective:** Enable patients to preview and export/print their Consultation Preparation Packet (`src/export.ts`) containing their verified oncology summary, selected records (`packSelected`), priority questions, personal notes, and approved clinician instructions, with strict HTML escaping (`escapeHtml`) and provenance citations.
- **Source Document:** `docs/patient-continuity.md`, `apps/mobile/src/export.ts`
- **Requirement Authority:** `ORIGINAL_ONCOBRIEF`
- **Classification:** `CORE`
- **Target User:** Patient / Caregiver / Oncologist
- **User Story:** As a patient walking into an oncology consultation, I want to view or export a clean, printable one-page consultation packet on my phone that summarizes my selected records, questions, and verified care stage.
- **Existing Implementation (`757f495`):** `apps/mobile/src/export.ts` builds a basic HTML summary using `state.selected` without oncology journey stage, provenance hashes, or approved clinician instructions.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/src/export.ts`, `apps/mobile/src/preparation-workspace.tsx`
- **API / Data Dependency:** Uses `state.packSelected` (`REQ-MOB-024`) and snapshot provenance fields.
- **Security Dependency:** All user-supplied strings in `buildSummaryHtml` MUST pass through `escapeHtml()` to prevent stored XSS in print/WebView (`SEC-NEG-14`).
- **Acceptance Criteria:**
  1. `buildSummaryHtml(state)` uses `state.packSelected` (or `state.shareSelected` when called in share mode), includes verified oncology journey stage and document provenance badges, and escapes all dynamic strings via `escapeHtml`.
- **Unit Tests Required:** `apps/mobile/test/export-security.test.ts` (includes XSS injection test payloads `<script>alert(1)</script>`).
- **Integration Tests Required:** Snapshot-to-export rendering test.
- **E2E / Native Tests Required:** Playwright E2E packet export preview test.
- **Milestone:** `M3` | **Priority:** `P1` | **Definition of Done:** Task `MOB-015` verified green.

---

### Workstream G — Multilingual Text & Voice Accessibility (English + Tamil + Scoped TTS)

#### `REQ-MOB-029` — UTF-8 Tamil String Repair (`BUG-MOB-01`) & Complete Bilingual Dictionary (`BUG-MOB-10`)
- **Product Objective:** Replace the corrupted CP866 Mojibake string `'родрооро┐ро┤рпН'` in `apps/mobile/app/(tabs)/profile.tsx:8` with `'தமிழ்'` (`t(state.language, 'ta')`), add missing localization keys (`editQuestion`, `removeQuestion`, plus all new oncology/continuity keys) to `apps/mobile/src/copy.ts` for both `en` and `ta`, and add an automated UTF-8 / Tamil script integrity test so Mojibake can never recur.
- **Source Document:** Branch Audit `BUG-MOB-01`, `BUG-MOB-10`, `ONCOBRIEF_ENHANCEMENT_PLAN.md`
- **Requirement Authority:** `OFFICIAL_HACKATHON`
- **Classification:** `CORE`
- **Target User:** Tamil-speaking Patient & Caregiver
- **User Story:** As a Tamil-speaking patient, I want the Tamil language button on my Profile screen to display `"தமிழ்"` rather than unreadable garbled Cyrillic characters, and I want every button and label in the app to have a proper Tamil translation.
- **Existing Implementation (`757f495`):** `app/(tabs)/profile.tsx:8` hardcodes `'родрооро┐ро┤рпН'`; `app/audit.tsx:6` references `t(state.language, 'editQuestion')` and `'removeQuestion'` which are missing from `src/copy.ts`.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/app/(tabs)/profile.tsx`, `apps/mobile/src/copy.ts`, `apps/mobile/test/localization-utf8.test.ts` (new)
- **API / Data Dependency:** None.
- **Security Dependency:** None.
- **Acceptance Criteria:**
  1. `app/(tabs)/profile.tsx` renders `t(state.language, 'ta')` which resolves to `'தமிழ்'` (`தமிழ்`).
  2. Every key in `labels.en` has a non-empty, valid UTF-8 counterpart in `labels.ta` containing Tamil Unicode block characters (`஀`–`௿`) where appropriate and zero Cyrillic characters (`Ѐ`–`ӿ`).
  3. `editQuestion` and `removeQuestion` are defined in both `labels.en` and `labels.ta`.
- **Unit Tests Required:** `apps/mobile/test/localization-utf8.test.ts` (asserts key parity between `en` and `ta`, zero Cyrillic codepoints across all files in `apps/mobile`, and valid Tamil Unicode in `labels.ta`).
- **Integration Tests Required:** None.
- **E2E / Native Tests Required:** Playwright E2E language toggle test verifying `"தமிழ்"` renders in DOM.
- **Milestone:** `M1` | **Priority:** `P0` | **Definition of Done:** Task `MOB-001` verified green.

#### `REQ-MOB-030` — Multilingual Voice Accessibility / Scoped TTS Playback (`POST /api/v1/patient-portal/voice-tts`)
- **Product Objective:** Enable patients and caregivers with low literacy or visual fatigue to listen to clinician-approved continuity messages, consultation preparation checklists, and verified document summaries in English (`en-IN`) or Tamil (`ta-IN`) using the backend scoped TTS service (`apps/web/src/lib/scoped-tts.ts`) with native speech fallback (`expo-speech` / Web Speech API).
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `apps/web/src/lib/scoped-tts.ts`, `apps/web/src/app/api/v1/continuity/tts/route.ts`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Elderly or Low-Literacy Caregiver
- **User Story:** As an elderly Tamil-speaking cancer patient, I want to tap a "Listen in Tamil (குரலில் கேட்க)" button on my doctor's approved instructions and consultation summary so I can hear them read aloud clearly.
- **Existing Implementation (`757f495`):** Zero audio/TTS capability exists in `apps/mobile`, even though `apps/web/src/lib/scoped-tts.ts` is already implemented on the backend.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/voice-tts/route.ts` (new), `apps/mobile/src/voice-tts.ts` (new), `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/record/[id].tsx`, `apps/mobile/src/preparation-workspace.tsx`
- **API / Data Dependency:** Wraps `synthesizeApprovedMessageSpeech` in `apps/web/src/lib/scoped-tts.ts`.
- **Security Dependency:** Scoped strictly to patient's authorized `continuity_message` or verified document summary; unapproved continuity messages return `403 Forbidden` (`SEC-NEG-12`).
- **Acceptance Criteria:**
  1. `POST /api/v1/patient-portal/voice-tts` accepts `{ messageId, language: 'en' | 'ta' }` for an approved message belonging to `session.patientId` and returns `{ audioBase64, mimeType: 'audio/wav', language, durationEstimateMs, transcript }`.
  2. Mobile `VoicePlayerBar` component provides Play, Pause/Stop, Language (`English` / `தமிழ்`), and playback state indicator (`Speaking...` / `Stopped`) on approved messages and record summaries.
  3. In Offline Demo Mode, `voice-tts.ts` falls back cleanly to browser `window.speechSynthesis` / native speech synthesis or deterministic WAV synthesis so audio playback works both online and offline.
- **Unit Tests Required:** `apps/mobile/test/voice-tts.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/voice-tts/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E voice playback button interaction & state verification.
- **Milestone:** `M2` & `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-010` & `MOB-016` verified green.

#### `REQ-MOB-031` — Bilingual Localization of Oncology Seed Cohort, Stages & Instructions (`en` / `ta`)
- **Product Objective:** Ensure that switching the app language to Tamil (`ta`) translates not only static button chrome, but also the oncology journey stage descriptions, preparation checklist titles/details, glossary explanations, and approved continuity messages in `DEMO-001`..`003`.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, Branch Audit Section 6
- **Requirement Authority:** `OFFICIAL_HACKATHON`
- **Classification:** `CORE`
- **Target User:** Tamil-speaking Patient & Caregiver
- **User Story:** As a Tamil-speaking user switching the app to `தமிழ்`, I want the consultation checklist items, medical glossary explanations, and care team instructions to appear in Tamil rather than staying in English.
- **Existing Implementation (`757f495`):** Static UI labels in `src/copy.ts` switch to Tamil, but all checklist items, glossary terms, and document summaries in `src/domain.ts` remain hardcoded in English.
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/src/oncology-cohort.ts`, `apps/mobile/src/copy.ts`, `apps/mobile/src/domain.ts`
- **API / Data Dependency:** Supports `titleTa`, `summaryTa`, `detailTa` fields on localized domain entities.
- **Security Dependency:** Verbatim clinical numbers/dates remain identical across languages; zero clinical re-interpretation.
- **Acceptance Criteria:**
  1. Toggling language to `ta` renders Tamil checklist items, Tamil glossary definitions, and Tamil continuity message bodies across Home, Records, Prepare, Care, and Profile screens.
- **Unit Tests Required:** `apps/mobile/test/localization-utf8.test.ts`.
- **Integration Tests Required:** Snapshot bilingual payload test.
- **E2E / Native Tests Required:** Playwright E2E Tamil journey walkthrough.
- **Milestone:** `M1` | **Priority:** `P1` | **Definition of Done:** Task `MOB-003` verified green.

---

### Workstream H — Consented Caregiver Participation & Scoped Sharing

#### `REQ-MOB-032` — Consented Caregiver Management UI & Backend Sync (`POST/PATCH/DELETE .../caregivers`)
- **Product Objective:** Connect the mobile app to the backend `caregiver_contact` service (`packages/db/src/services/caregivers.ts`) so a patient can view, add, update scopes (`appointments`, `reminders`, `documents`, `preparation`), pause, or revoke consented family caregivers from `app/sharing.tsx` and `app/(tabs)/profile.tsx`.
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `packages/db/src/services/caregivers.ts`, `migrations/0015_v4_1_continuity_and_appointments.sql`, `migrations/0020_v4_2_workflow_extensions.sql`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Consented Family Caregiver
- **User Story:** As a cancer patient whose spouse or adult child helps manage my hospital visits, I want to grant them specific permissions (such as receiving appointment reminders and viewing my consultation pack) and revoke or change their access at any time.
- **Existing Implementation (`757f495`):** Only a plain text string `state.visit.companion` exists in `app/sharing.tsx`; zero integration with `caregiver_contact`.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/caregivers/route.ts` (new), `apps/web/src/app/api/v1/patient-portal/caregivers/[caregiverId]/route.ts` (new), `apps/mobile/app/sharing.tsx`, `apps/mobile/src/domain.ts`
- **API / Data Dependency:** `createCaregiverContact`, `listCaregiverContacts`, `updateCaregiverConsent` in `packages/db/src/services/caregivers.ts`.
- **Security Dependency:** Only an authenticated `patient` actor (`session.actorRole === 'patient'`) can add, modify scopes, or revoke caregivers; a `caregiver` session attempting to escalate scopes receives HTTP `403 Forbidden` (`SEC-NEG-13`).
- **Acceptance Criteria:**
  1. Patient can add a caregiver (`name`, `relationship`, `phone`, `consentScopes`), toggle active scopes, and revoke consent (`consentStatus: 'revoked'`).
  2. Revoking a caregiver immediately invalidates any active `patient_portal_session` bound to that `caregiver_contact_id`.
- **Unit Tests Required:** `apps/mobile/test/caregiver-sharing.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/caregivers/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E caregiver consent and revocation test.
- **Milestone:** `M2` & `M3` | **Priority:** `P0` | **Definition of Done:** Task `MOB-010` & `MOB-017` verified green.

#### `REQ-MOB-033` — Time-Bounded & Revocable Consultation Share Grants (`POST/DELETE .../shares`)
- **Product Objective:** Back the mobile `/sharing` consultation summary share flow with `patient_share_grant` in PostgreSQL so share grants have an explicit recipient label, scoped document list (`shareSelected`), expiration timestamp (`expiresAt`, default 72 hours), access token hash, and instant server-side revocation (`DELETE /api/v1/patient-portal/shares/[grantId]`).
- **Source Document:** `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `docs/patient-continuity.md`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `EXTENDED`
- **Target User:** Patient / Caregiver
- **User Story:** As a patient sharing a subset of my records for a consultation, I want the share link/grant to expire automatically after 72 hours and I want a "Revoke Share Now" button that invalidates server access immediately.
- **Existing Implementation (`757f495`):** `app/sharing.tsx` flips a local `state.shared: boolean` with no server grant or expiration.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/web/src/app/api/v1/patient-portal/shares/route.ts` (new), `apps/web/src/app/api/v1/patient-portal/shares/[grantId]/route.ts` (new), `apps/mobile/app/sharing.tsx`
- **API / Data Dependency:** `patient_share_grant` table in `packages/db`.
- **Security Dependency:** Uses `state.shareSelected` (`REQ-MOB-024`), stores only SHA-256 hash of share token in DB, and enforces expiration and revocation checks.
- **Acceptance Criteria:**
  1. Creating a share grant persists `patient_share_grant` with `document_ids = state.shareSelected` and `expires_at`.
  2. Revoking the share grant sets `revoked_at = NOW()` and updates `app/sharing.tsx` status immediately.
- **Unit Tests Required:** `apps/mobile/test/caregiver-sharing.test.ts`.
- **Integration Tests Required:** `apps/web/src/app/api/v1/patient-portal/shares/route.test.ts`.
- **E2E / Native Tests Required:** Playwright E2E share creation & revocation flow.
- **Milestone:** `M2` & `M3` | **Priority:** `P1` | **Definition of Done:** Task `MOB-011` & `MOB-017` verified green.

---

### Workstream I — Privacy, Consent, Revocation & Local Security Hardening

#### `REQ-MOB-034` — Encrypted At-Rest Storage via AES-256-GCM + `expo-secure-store` (`SEC-MOB-01`) & Web `localStorage` Fallback (`BUG-MOB-08`)
- **Product Objective:** Replace plaintext `state-v1.json` persistence in `apps/mobile/src/storage.ts` with authenticated AES-256-GCM encryption whose 256-bit key is generated via CSPRNG and stored in Android Keystore via `expo-secure-store` on native devices, while providing a working session/localStorage persistence layer on Web so browser page reloads (`F5`) preserve state during web demos (`BUG-MOB-08`).
- **Source Document:** Branch Audit `SEC-MOB-01`, `BUG-MOB-08`, `docs/superpowers/plans/2026-10-28-patient-android.md`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Security Auditor
- **User Story:** As a patient storing sensitive oncology records on my phone, I need my local cache encrypted with a hardware-backed key so plaintext health records are never written to disk, and when testing in a web browser, reloading the page should not wipe my session.
- **Existing Implementation (`757f495`):** `apps/mobile/src/storage.ts:13` writes unencrypted JSON to `${FileSystem.documentDirectory}state-v1.json` and returns `null`/no-op when `Platform.OS === 'web'`.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/src/storage.ts`, `apps/mobile/src/crypto-envelope.ts` (new), `apps/mobile/package.json`
- **API / Data Dependency:** `expo-secure-store` + WebCrypto AES-256-GCM (`SubtleCrypto` / Node `crypto.subtle`).
- **Security Dependency:** Envelope format `{"v":2,"alg":"AES-256-GCM","iv":"<base64>","tag":"<base64>","ciphertext":"<base64>"}`. Deleting the key in `expo-secure-store` cryptographically shreds all local state on revocation/reset.
- **Acceptance Criteria:**
  1. On native (`Platform.OS !== 'web'`), `state-v2.enc.json` on disk contains only the encrypted AES-256-GCM envelope; inspecting raw file bytes reveals zero plaintext patient names or medical strings.
  2. Tampering with `ciphertext` or `tag` in `state-v2.enc.json` fails authentication and safely resets/prompts re-sync rather than crashing.
  3. On web (`Platform.OS === 'web'`), state persists across `page.reload()` in Playwright and clears completely on Reset/Revoke.
- **Unit Tests Required:** `apps/mobile/test/encrypted-storage.test.ts` (verifies encryption, decryption, tamper detection, legacy v1 migration, and cryptographic key erasure).
- **Integration Tests Required:** Repository load/save round-trip test.
- **E2E / Native Tests Required:** Playwright E2E `page.reload()` persistence test (`apps/mobile/e2e/patient-app.spec.ts`).
- **Milestone:** `M4` | **Priority:** `P0` | **Definition of Done:** Task `MOB-018` verified green.

#### `REQ-MOB-035` — Explicit Informed Consent Gate on First Launch (`BUG-MOB-07`) & Revocation Wipe
- **Product Objective:** Fix `apps/mobile/app/index.tsx` so un-onboarded users (`!state.onboarded`) are routed to `/onboarding` (`app/onboarding.tsx`) and must explicitly review the bilingual privacy/non-clinical scope notice and tap `Accept & Continue` before entering `/(tabs)`, and ensure `Revoke Consent / Reset` wipes server sessions, local encrypted storage, and imported files.
- **Source Document:** Branch Audit `BUG-MOB-07`, `OFFICIAL_HACKATHON`
- **Requirement Authority:** `OFFICIAL_HACKATHON`
- **Classification:** `CORE`
- **Target User:** Patient
- **User Story:** As a first-time patient user, I must see and explicitly accept the privacy and non-diagnostic scope notice before the app loads my records, and if I revoke consent in Profile, all local and session data must be erased.
- **Existing Implementation (`757f495`):** `apps/mobile/app/index.tsx:12` auto-dispatches `onboard` in a `useEffect` and redirects to `/(tabs)`, completely bypassing `app/onboarding.tsx` (`BUG-MOB-07`).
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/app/index.tsx`, `apps/mobile/app/onboarding.tsx`, `apps/mobile/app/(tabs)/profile.tsx`
- **API / Data Dependency:** Calls `DELETE /api/v1/patient-portal/session` and `clearPersisted()` on revocation.
- **Security Dependency:** Explicit consent timestamp recorded in state and audit log before any data sync.
- **Acceptance Criteria:**
  1. Launching the app with `state.onboarded === false` renders `/onboarding` and does NOT auto-dispatch `onboard`.
  2. Tapping `Continue` on `/onboarding` records `onboarded: true` and `consentedAt: <ISO timestamp>` and navigates to `/(tabs)`.
  3. Tapping `Revoke Consent & Erase Local Data` on Profile calls server session revocation, shreds the `expo-secure-store` key + local files, and returns the user to `/onboarding`.
- **Unit Tests Required:** `apps/mobile/test/onboarding-consent.test.ts`.
- **Integration Tests Required:** Session revocation integration test.
- **E2E / Native Tests Required:** Playwright E2E first-launch onboarding gate + revocation reset test.
- **Milestone:** `M1` & `M4` | **Priority:** `P0` | **Definition of Done:** Task `MOB-004` & `MOB-018` verified green.

#### `REQ-MOB-036` — Native Screen-Capture Protection (`FLAG_SECURE`), App-Switcher Privacy Overlay & External URL Removal (`SEC-MOB-05`, `SEC-MOB-06`)
- **Product Objective:** Prevent unauthorized screenshots/screen recordings on Android when privacy shield is enabled (`FLAG_SECURE` / screen-capture guard), render a privacy curtain when `AppState` transitions to `background`/`inactive`, and remove the unconsented external `Linking.openURL('https://medlineplus.gov/...')` call from `apps/mobile/src/laboratory.tsx:40` (`SEC-MOB-06`).
- **Source Document:** Branch Audit `SEC-MOB-05`, `SEC-MOB-06`, `docs/superpowers/plans/2026-10-28-patient-android.md`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Patient / Security Auditor
- **User Story:** As a patient viewing oncology lab reports in a crowded waiting room, I want my phone to hide my medical screen in the Android recent-apps switcher and never leak my lab test names to external third-party websites.
- **Existing Implementation (`757f495`):** No `AppState` privacy curtain, no `FLAG_SECURE`, and `src/laboratory.tsx:40` opens `https://medlineplus.gov/lab-tests/?query=${encodeURIComponent(r.title)}` in an external browser.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/src/laboratory.tsx`, `apps/mobile/app/_layout.tsx`, `apps/mobile/src/privacy-shield.tsx` (new)
- **API / Data Dependency:** React Native `AppState` + native Android `FLAG_SECURE` configuration.
- **Security Dependency:** Eliminates third-party URL query leakage (`SEC-MOB-06`) and recents-thumbnail PHI exposure (`SEC-MOB-05`).
- **Acceptance Criteria:**
  1. `Linking.openURL('https://medlineplus.gov/...')` is completely removed from `apps/mobile/src/laboratory.tsx`; replaced by an in-app, offline-safe oncology lab glossary drawer with zero external network leakage.
  2. When `AppState` is `'background'` or `'inactive'`, `PrivacyShieldOverlay` covers the viewport so OS task switchers do not capture clinical text.
- **Unit Tests Required:** `apps/mobile/test/privacy-shield.test.ts` (asserts zero external `medlineplus.gov` URLs and verifies `PrivacyShieldOverlay` rendering on background state).
- **Integration Tests Required:** Static scan in `clinical-boundary-mobile.test.ts`.
- **E2E / Native Tests Required:** Verified in Playwright and Android APK smoke tests.
- **Milestone:** `M4` | **Priority:** `P1` | **Definition of Done:** Task `MOB-019` verified green.

#### `REQ-MOB-037` — Bounded Hash-Chained Local Audit Log & Debounced Draft Persistence (`SEC-MOB-07`, `BUG-MOB-13`)
- **Product Objective:** Cap the local `state.audit` ring buffer at `250` entries with a SHA-256 `prevHash -> entryHash` integrity chain (`SEC-MOB-07`), and debounce `useDraft` persistence in `apps/mobile/src/store.tsx:31` (`250ms` trailing debounce + flush on blur/unmount) so typing in text inputs does not serialize and encrypt the full state on every keystroke (`BUG-MOB-13`).
- **Source Document:** Branch Audit `SEC-MOB-07`, `BUG-MOB-13`
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `EXTENDED`
- **Target User:** Patient / Security Auditor
- **User Story:** As a patient typing notes or questions on a budget Android phone, I want smooth typing without lag on every keystroke and a tamper-evident activity log that does not grow without bound.
- **Existing Implementation (`757f495`):** `src/domain.ts:69` (`stamp`) prepends unbounded plain objects to `state.audit`; `src/store.tsx:31` writes full state to disk on every keystroke.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `apps/mobile/src/domain.ts`, `apps/mobile/src/store.tsx`, `apps/mobile/app/audit.tsx`
- **API / Data Dependency:** None.
- **Security Dependency:** Hash-chained audit entries (`prevHash`, `hash`) allow `verifyAuditChain(state.audit)` to detect tampering.
- **Acceptance Criteria:**
  1. `state.audit` never exceeds `250` entries (`MAX_AUDIT_ENTRIES = 250`) and each entry includes a deterministic integrity hash chained to the previous entry.
  2. `useDraft` updates local input state immediately (0 ms UI latency) and debounces repository persistence by `250ms` with immediate flush on unmount/submit.
- **Unit Tests Required:** `apps/mobile/test/audit-chain-and-draft.test.ts`.
- **Integration Tests Required:** None.
- **E2E / Native Tests Required:** Playwright E2E audit screen verification.
- **Milestone:** `M4` | **Priority:** `P1` | **Definition of Done:** Task `MOB-018` verified green.

---

### Workstream J — UI/UX Polish, Design System & WCAG 2.2 AA Accessibility

#### `REQ-MOB-038` — WCAG 2.2 AA Color Contrast Remediation (`BUG-MOB-12`)
- **Product Objective:** Update the color palette tokens in `apps/mobile/src/ui-core.tsx` (`c.teal`, `c.line`, `c.sand`, `c.amber`, and chart stroke/axis colors) so every text-on-background pairing meets WCAG 2.2 AA (`≥ 4.5:1` for normal text, `≥ 3.0:1` for large text and non-text UI borders/chart elements).
- **Source Document:** Branch Audit `BUG-MOB-12`, WCAG 2.2 AA Specification
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Low-vision & Elderly Oncology Patients
- **User Story:** As an oncology patient reading my records under bright clinic lighting, I need sufficient contrast on badges, borders, and charts so text and controls are effortless to read.
- **Existing Implementation (`757f495`):** `c.teal (#087F80)` on `c.sage (#E8F7F3)` is `4.37:1` (< 4.5:1); `c.line (#E1E9F3)` on `#FFFFFF` is `1.22:1`; `c.sand (#D6E0EF)` is `1.33:1` (`BUG-MOB-12`).
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/src/ui-core.tsx`, `apps/mobile/src/history-chart.tsx`, `apps/mobile/src/vital-chart.tsx`, `apps/mobile/src/wellbeing-chart.tsx`
- **API / Data Dependency:** None.
- **Security Dependency:** None.
- **Acceptance Criteria:**
  1. `c.teal` is darkened to `#06696B` (`5.48:1` on `c.sage #E8F7F3` and `6.45:1` on `#FFFFFF`).
  2. `c.line` / border tokens for interactive inputs and cards use `#8496AE` (`3.05:1` on `#FFFFFF`) or explicit high-contrast text labels.
  3. Automated contrast ratio test in `apps/mobile/test/accessibility-wcag.test.ts` computes relative luminance for all token pairs and asserts `>= 4.5` for text pairs and `>= 3.0` for UI component boundaries.
- **Unit Tests Required:** `apps/mobile/test/accessibility-wcag.test.ts`.
- **Integration Tests Required:** None.
- **E2E / Native Tests Required:** Playwright E2E visual and accessibility assertions.
- **Milestone:** `M1` | **Priority:** `P1` | **Definition of Done:** Task `MOB-005` verified green.

#### `REQ-MOB-039` — Accessible SVG Charts (`accessibilityLabel`), `<KeyboardAvoidingView>` & Touch Target Compliance (`BUG-MOB-12`)
- **Product Objective:** Replace `accessible={false}` on all SVG charts (`src/history-chart.tsx`, `src/vital-chart.tsx`, `src/wellbeing-chart.tsx`) with descriptive bilingual `accessibilityRole="image"` and `accessibilityLabel` summaries of the plotted values, wrap `Screen` (`src/ui-core.tsx:18-29`) in `<KeyboardAvoidingView>` so the soft keyboard never obscures bottom inputs, and ensure all interactive controls have `minHeight: 48` (`48x48dp` Android touch target minimum).
- **Source Document:** Branch Audit `BUG-MOB-12`, Android TalkBack & WCAG 2.2 AA Guidelines
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** TalkBack / Screen-Reader Users & Mobile Touch Users
- **User Story:** As a screen-reader user or a patient typing questions on an Android phone, I need charts to announce their data points aloud and text inputs to stay visible above the on-screen keyboard.
- **Existing Implementation (`757f495`):** All `<Svg>` components set `accessible={false}`, hiding trend data from TalkBack; `Screen` lacks `<KeyboardAvoidingView>`.
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/src/ui-core.tsx`, `apps/mobile/src/history-chart.tsx`, `apps/mobile/src/vital-chart.tsx`, `apps/mobile/src/wellbeing-chart.tsx`
- **API / Data Dependency:** None.
- **Security Dependency:** None.
- **Acceptance Criteria:**
  1. Every chart container exposes `accessible={true}`, `accessibilityRole="summary"`, and a deterministic `accessibilityLabel` listing the series count, latest value, and date range.
  2. `Screen` in `apps/mobile/src/ui-core.tsx` wraps `<ScrollView>` inside `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>`.
  3. All interactive `<Pressable>` elements in `ui-core.tsx` enforce `minHeight: 48` and `hitSlop={6}`.
- **Unit Tests Required:** `apps/mobile/test/accessibility-wcag.test.ts`.
- **Integration Tests Required:** None.
- **E2E / Native Tests Required:** Playwright E2E ARIA label and touch target box assertions.
- **Milestone:** `M1` | **Priority:** `P1` | **Definition of Done:** Task `MOB-005` verified green.

---

### Workstream K — Native Android Packaging, APK Generation & Runtime Verification

#### `REQ-MOB-040` — Native Android Prebuild, Hermes Bundle & Debug/Release APK Generation (`assembleDebug`)
- **Product Objective:** Configure `apps/mobile/app.json` and Expo prebuild/Gradle configuration so `npx expo export --platform android` (Hermes `.hbc` bytecode bundle), `npx expo prebuild --platform android`, and `./gradlew assembleDebug` produce an installable Android `.apk` artifact with clean dependency alignment.
- **Source Document:** `docs/decisions/0017-independent-patient-android.md`, Health-a-thon Android Requirement
- **Requirement Authority:** `OFFICIAL_HACKATHON`
- **Classification:** `CORE`
- **Target User:** Patient / QA Lead / Release Engineer
- **User Story:** As a QA engineer or hackathon judge, I need a reproducible build pipeline that generates an installable Android `.apk` from `apps/mobile` and verifies its Hermes bytecode bundle and native manifest permissions.
- **Existing Implementation (`757f495`):** `app.json` defines package `com.oncobrief.patient`, and `npx expo export --platform android` succeeds, but no `android/` project or `.apk` has been generated or verified (`0%` APK verification).
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/app.json`, `apps/mobile/package.json`, `tools/verify-android-build.sh` (new)
- **API / Data Dependency:** `EXPO_PUBLIC_API_BASE_URL` configurable via environment variable for connected mode (`http://10.0.2.2:3000` on Android emulator, LAN IP on physical device).
- **Security Dependency:** `android:allowBackup="false"` in `app.json` / `AndroidManifest.xml` so Android Auto Backup does not exfiltrate sandbox files to cloud backup.
- **Acceptance Criteria:**
  1. `app.json` explicitly sets `android.allowBackup: false`, appropriate permissions, and network config.
  2. `npx expo export --platform android` generates `.hbc` Hermes bundle cleanly with zero unresolved imports.
  3. When Android SDK (`ANDROID_HOME`) and JDK 17 are present, `npx expo prebuild --platform android && cd android && ./gradlew assembleDebug` produces `android/app/build/outputs/apk/debug/app-debug.apk` and records its SHA-256 checksum.
- **Unit Tests Required:** Manifest/config validation test (`apps/mobile/test/android-config.test.ts`).
- **Integration Tests Required:** `npx expo export --platform android` Hermes bundle gate.
- **E2E / Native Tests Required:** `./gradlew assembleDebug` APK artifact check (`docs/plans/PATIENT_MOBILE_RELEASE_GATES.md`).
- **Milestone:** `M6` | **Priority:** `P0` | **Definition of Done:** Task `MOB-022` verified green.

#### `REQ-MOB-041` — Native Android Emulator/Device Installation & Runtime Smoke Verification (`adb install` + Maestro)
- **Product Objective:** Install the built Android `.apk` onto a connected Android Emulator or physical device via `adb install -r`, launch `com.oncobrief.patient/.MainActivity`, and execute an automated native UI smoke flow (`apps/mobile/maestro/patient-smoke.yaml` or `adb` UI Automator script) verifying zero native crash in `adb logcat`.
- **Source Document:** Master Implementation Planning Directive Section 9.5 & Section 10
- **Requirement Authority:** `OFFICIAL_HACKATHON`
- **Classification:** `CORE`
- **Target User:** Patient / QA Lead
- **User Story:** As a release auditor, I require proof from an actual Android runtime (`adb install`, `adb shell am start`, `adb logcat`, Maestro/UIAutomator) before Native Android Verification is marked complete—never equating Expo Web preview with native Android execution.
- **Existing Implementation (`757f495`):** `0%` executed; previous commits relied solely on Node unit tests and Playwright web tests.
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/maestro/patient-smoke.yaml` (new), `tools/verify-android-runtime.sh` (new)
- **API / Data Dependency:** Android SDK `platform-tools` (`adb`), `emulator`, JDK 17.
- **Security Dependency:** Verifies `allowBackup=false` and `FLAG_SECURE` window flags via `adb shell dumpsys window`.
- **Acceptance Criteria:**
  1. `adb install -r app-debug.apk` succeeds with `Success`.
  2. Launching `com.oncobrief.patient/.MainActivity` renders the Onboarding consent gate, switches to `தமிழ்` and back, navigates across all 5 tabs (`Home`, `Records`, `Prepare`, `Care`, `Profile`), imports a sample document, and shows zero `FATAL EXCEPTION` in `adb logcat`.
  3. If the execution host lacks Android SDK/emulator, the task MUST be marked `BLOCKED` (never `COMPLETE`) with exact environment diagnostics and recovery instructions in `PATIENT_MOBILE_EXECUTION_TRACKER.md`.
- **Unit Tests Required:** Config and script syntax check.
- **Integration Tests Required:** Hermes bundle export check.
- **E2E / Native Tests Required:** `tools/verify-android-runtime.sh` + `apps/mobile/maestro/patient-smoke.yaml`.
- **Milestone:** `M6` | **Priority:** `P0` | **Definition of Done:** Task `MOB-023` verified green on Android runtime.

---

### Workstream L — Repository Governance, ADR De-Confliction, Testing & CI/CD

#### `REQ-MOB-042` — ADR Numbering De-Confliction (`0017` → `0026`, `BUG-MOB-14`) & Git Worktree Isolation
- **Product Objective:** Resolve the ADR numbering collision where `docs/decisions/0017-independent-patient-android.md` collides with `docs/decisions/0017-abdm-m2-m3-integration.md`. Since identifiers `0018` through `0025` are already occupied by existing foundation and clinical ADRs, the mobile architecture ADR is renumbered to `docs/decisions/0026-patient-mobile-architecture.md` and updated to reflect the dual-mode architecture (Connected Hospital Mode + Offline Synthetic Demo Mode) while executing all branch work inside an isolated Git worktree (`../OncoBrief-patient-mobile`) so uncommitted work in `/Users/dhaanish/Documents/OncoBrief` is never disturbed.
- **Source Document:** Branch Audit `BUG-MOB-14`, Master Directive Section 1 & Section 9
- **Requirement Authority:** `ORIGINAL_ONCOBRIEF`
- **Classification:** `CORE`
- **Target User:** Engineering Team
- **User Story:** As a repository maintainer, I need unique ADR numbers and an isolated Git worktree so implementing the mobile branch never overwrites or conflicts with in-progress V4 web/backend work.
- **Existing Implementation (`757f495`):** Duplicate `0017` ADR number; main checkout has 50 modified and 28 untracked files on `feat/v4-assessment-remediation`.
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `docs/decisions/0026-patient-mobile-architecture.md` (renamed from `0017-independent-patient-android.md`), `apps/mobile/test/repo-hygiene.test.ts`
- **API / Data Dependency:** None.
- **Security Dependency:** Protects uncommitted local worktree state.
- **Acceptance Criteria:**
  1. `git worktree list` shows `oncobrief-patient-app` checked out in an isolated directory (`../OncoBrief-patient-mobile`), leaving `/Users/dhaanish/Documents/OncoBrief` untouched.
  2. `docs/decisions/` contains no duplicate numeric prefixes (`0001` through `0026` are strictly unique).
  3. `apps/mobile/test/repo-hygiene.test.ts` passes with exit code 0.
- **Unit Tests Required:** ADR filename uniqueness and dual-mode verification checks in `apps/mobile/test/repo-hygiene.test.ts`.
- **Integration Tests Required:** None.
- **E2E / Native Tests Required:** None.
- **Milestone:** `M0` | **Priority:** `P0` | **Definition of Done:** Task `MOB-000` verified green.

#### `REQ-MOB-043` — Comprehensive Unit, Component, Contract, RLS & Security Negative Test Suite
- **Product Objective:** Expand automated test coverage across `@oncobrief/mobile`, `@oncobrief/db`, and `@oncobrief/web` to cover all 45 requirements, all 14 confirmed defects (`BUG-MOB-01`..`14`), all 7 security findings (`SEC-MOB-01`..`07`), and 20 explicit security negative test cases (`SEC-NEG-01`..`20`).
- **Source Document:** Master Directive Section 7 (TDD Mandate)
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Engineering & QA
- **User Story:** As an SDET, I need every requirement and security boundary backed by deterministic unit, database RLS, and API contract tests that fail before implementation and pass after implementation.
- **Existing Implementation (`757f495`):** 36 unit tests in `apps/mobile/test/mobile-app.test.ts` testing only offline reducer logic; 0 API contract, DB RLS, or security negative tests for mobile.
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/test/*.test.ts`, `packages/db/test/patient-portal*.test.ts`, `apps/web/src/app/api/v1/patient-portal/**/*.test.ts`
- **API / Data Dependency:** Node `--test` runner + `tsx`.
- **Security Dependency:** Verifies `SEC-NEG-01` through `SEC-NEG-20`.
- **Acceptance Criteria:**
  1. ≥ 120 automated unit, component, contract, RLS, clinical-boundary, and security negative assertions pass with `0` failures and `0` skipped tests.
- **Unit Tests Required:** All suites listed in `docs/plans/PATIENT_MOBILE_TDD_TEST_MATRIX.md`.
- **Integration Tests Required:** All DB and API contract suites in `PATIENT_MOBILE_TDD_TEST_MATRIX.md`.
- **E2E / Native Tests Required:** Coordinated with `REQ-MOB-044`.
- **Milestone:** `M5` | **Priority:** `P0` | **Definition of Done:** Task `MOB-020` verified green.

#### `REQ-MOB-044` — Full Clinician-to-Patient E2E Continuity Playwright Suite
- **Product Objective:** Implement an automated Playwright E2E test suite (`apps/mobile/e2e/patient-app.spec.ts` and `apps/mobile/e2e/clinician-patient-continuity.spec.ts`) that executes both the standalone mobile journeys (`DEMO-001`..`003`, Tamil localization, reload persistence, accessibility, clinical boundary) and the complete 20-step connected clinician-to-patient continuity loop.
- **Source Document:** Master Directive Section 7.2 & Section 11.2
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Engineering & QA
- **User Story:** As a QA architect, I want an automated end-to-end test that proves an action taken by a clinician or coordinator on the backend is visible in the patient mobile app, and an upload, flag, attendance confirmation, or caregiver update in the mobile app is immediately persisted and visible to the clinician platform.
- **Existing Implementation (`757f495`):** 5 Playwright tests in `apps/mobile/e2e/patient-app.spec.ts` testing only local in-memory mock actions.
- **Current Status:** `COMPLETE`
- **Exact Source Files:** `apps/mobile/e2e/patient-app.spec.ts`, `apps/mobile/e2e/clinician-patient-continuity.spec.ts` (new), `apps/mobile/playwright.config.ts`
- **API / Data Dependency:** Next.js API server + Expo web server + test database.
- **Security Dependency:** Asserts zero `pageerror` and zero `console.error` events throughout all E2E flows.
- **Acceptance Criteria:**
  1. All Playwright E2E specs pass with `0` console errors, `0` uncaught page errors, and verified screenshots for all core screens in English and Tamil.
- **Unit Tests Required:** N/A (E2E suite).
- **Integration Tests Required:** Backed by `/api/v1/patient-portal/*`.
- **E2E / Native Tests Required:** `pnpm --filter @oncobrief/mobile test:e2e`.
- **Milestone:** `M5` | **Priority:** `P0` | **Definition of Done:** Task `MOB-021` verified green.

#### `REQ-MOB-045` — Monorepo CI/CD Pipeline & Release Readiness Verification Gate
- **Product Objective:** Wire `@oncobrief/mobile` typechecking, clinical-boundary scanning, branding validation, unit tests, Playwright E2E tests, and Android Hermes bundle export into root `package.json` scripts and CI workflow gates so regressions in `apps/mobile` are caught automatically on every commit.
- **Source Document:** Master Directive Section 9.6 & Section 10
- **Requirement Authority:** `V4_ENHANCEMENT_PLAN`
- **Classification:** `CORE`
- **Target User:** Engineering & DevOps
- **User Story:** As a release manager, I want a single root verification script (`pnpm verify:patient-mobile`) and CI workflow that runs all static, unit, integration, clinical-boundary, E2E, and Android bundle checks in sequence and fails fast on any violation.
- **Existing Implementation (`757f495`):** Root `package.json` does not run mobile clinical-boundary or Android bundle verification gates.
- **Current Status:** `NOT_STARTED`
- **Exact Source Files:** `package.json`, `tools/verify-patient-mobile.sh` (new), `.github/workflows/ci.yml`
- **API / Data Dependency:** Monorepo workspace scripts.
- **Security Dependency:** Enforces `pnpm policy:check-clinical-boundary` and `pnpm validate:branding` in CI.
- **Acceptance Criteria:**
  1. `pnpm verify:patient-mobile` executes typecheck, clinical boundary scan, branding validation, unit tests, DB/API integration tests, Playwright E2E tests, and `expo export --platform android` with exit code `0`.
- **Unit Tests Required:** Verified via CI gate script.
- **Integration Tests Required:** Verified via CI gate script.
- **E2E / Native Tests Required:** Verified via CI gate script.
- **Milestone:** `M7` | **Priority:** `P1` | **Definition of Done:** Task `MOB-024` verified green.
