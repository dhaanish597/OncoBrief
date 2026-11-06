# OncoBrief — Complete Implementation Task Backlog (`TASK-001` through `TASK-026`)

- **Document Version:** 2.0 (Unified 100% Scope Edition — Zero In-Scope Deferrals)
- **Target Repository:** `/Users/dhaanish/Documents/OncoBrief`
- **Active Branch:** `feat/v4-assessment-remediation`
- **Coverage:** 100% of `REQ-001` through `REQ-065` across `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `docs/milestone-a.md`, `docs/milestone-b.md`, `CLAUDE.md`, `README.md`, and `reports/HEALTHATHON_2026_INDEPENDENT_CODE_AUDIT.md`.

---

## Wave 0 — Already Implemented on Branch `feat/v4-assessment-remediation` (Preserve Intact)

### TASK-001: Unify Consultation Readiness Vocabulary (`ready | gaps | blocked | none`) Across Domain & `/workspace`
1. **Task ID:** `TASK-001`
2. **Title:** Unify Consultation Readiness Vocabulary (`ready | gaps | blocked | none`) Across Domain & `/workspace`
3. **Status on Branch:** `IMPLEMENTED BUT UNVERIFIED` (Code & unit tests committed in working tree; awaiting host Mac Terminal CLI run)
4. **Priority & Severity:** `P0 — BLOCKER`
5. **Covered Requirements:** `REQ-010`, `REQ-048`
6. **Problem & Root Cause:** `apps/web/src/app/(app)/workspace/page.tsx` checked `p.readinessBand === 'complete'` and rendered `?band=complete`, whereas `packages/domain/src/twin/readiness.ts` and PostgreSQL `readiness_band` emit `'ready' | 'gaps' | 'blocked'` (or `'none'`).
7. **Files Modified:**
   - `packages/domain/src/twin/readiness.ts`
   - `apps/web/src/app/(app)/workspace/page.tsx`
   - `packages/domain/test/twin.test.ts`
8. **Exact Implementation Completed:** Added `WORKLIST_BAND_FILTER_VALUES = ['all', 'ready', 'gaps', 'blocked', 'none']`, `computeWorklistReadinessSummary()`, and `filterWorklistPatients()` in `readiness.ts`; updated `workspace/page.tsx` to use canonical values and added `None` filter pill; added unit tests in `twin.test.ts`.
9. **Verification Command:** `pnpm --filter @oncobrief/domain test && pnpm -r typecheck`

---

### TASK-002: Enforce Forced RLS on All 14 Milestone A/B Tables & Add Database-Level Provenance Triggers (`0020_remediation_rls_and_governance.sql`)
1. **Task ID:** `TASK-002`
2. **Title:** Enforce Forced RLS on All 14 Milestone A/B Tables & Add Database-Level Provenance Triggers (`0020_remediation_rls_and_governance.sql`)
3. **Status on Branch:** `IMPLEMENTED BUT UNVERIFIED` (Migration & DB integration test created in working tree; awaiting host PostgreSQL run)
4. **Priority & Severity:** `P0 — CRITICAL SECURITY & GOVERNANCE BLOCKER`
5. **Covered Requirements:** `REQ-032`, `REQ-036`, `REQ-039`, `REQ-040`, `REQ-041`, `REQ-064`
6. **Problem & Root Cause:** 14 tenant-scoped tables in `0016` and `0019` had `GRANT ... TO oncobrief_app` with zero RLS policies; `tumor_board_case` and `encounter_note_version` lacked ledger provenance columns and triggers; `chat_message` lacked agent trace columns; `opd_appointment_slot` lacked `appointment_id` FK.
7. **Files Created:**
   - `packages/db/migrations/0020_remediation_rls_and_governance.sql`
   - `packages/db/test/remediation-0020.test.ts`
8. **Exact Implementation Completed:** Enforced `ENABLE + FORCE RLS` with null-safe `NULLIF(current_setting('app.org_id', true), '')::uuid` policies on all 14 tables (`facility`, `department`, `clinician_profile`, `user_invitation`, `patient_care_team`, `clinic_session`, `clinician_unavailability`, `appointment`, `appointment_status_history`, `encounter`, `encounter_participant`, `encounter_note_version`, `tumor_board_meeting`, `tumor_board_case`); added `validate_tumor_board_case_governance()` and `validate_encounter_note_governance()` triggers; added `execution_trace_json`, `pending_action_json`, `provider_mode` on `chat_message`; added `appointment_id` FK on `opd_appointment_slot`.
9. **Verification Command:** `pnpm db:migrate && pnpm --filter @oncobrief/db test -- remediation-0020.test.ts`

---

## Wave 1 — Core Security, Clinical Governance, Ingestion Graph, OPD Sync, Co-Pilot & 11-Locale Voice (Parallelizable)

### TASK-003: Harden Next.js Middleware (`CVE-2025-29927`), Server Action RBAC, and Tenant/Patient Ownership Checks
- **Priority:** `P0 — CRITICAL SECURITY` | **Depends On:** `TASK-002` | **Covers:** `REQ-035`, `REQ-044`
- **Files to Modify / Create:**
  - `apps/web/src/middleware.ts`
  - `apps/web/src/lib/session.ts`
  - `apps/web/src/lib/actions.ts`
  - `apps/web/e2e/security-boundaries.spec.ts` (new)
- **Implementation Specification:**
  1. In `apps/web/src/middleware.ts`: Reject or strip any request containing `x-middleware-subrequest` header (`CVE-2025-29927` defense). Ensure matcher covers `/workspace/:path*`, `/patients/:path*`, `/appointments/:path*`, `/encounters/:path*`, `/tumor-board/:path*`, `/analytics/:path*`, `/settings/:path*`, `/onboarding/:path*`, and `/api/v1/:path*` (excluding `/api/v1/health`, `/api/v1/extension/capture`, `/api/v1/abdm/:path*`, and `/api/v1/continuity/webhook` which validate Bearer grant or webhook tokens).
  2. In `apps/web/src/lib/session.ts`: Add helper `assertPatientBelongsToOrg(q, orgId, patientId)` throwing `'patient_not_found_or_unauthorized'` if `SELECT 1 FROM patient WHERE id = $1 AND org_id = $2` returns 0 rows.
  3. In `apps/web/src/lib/actions.ts`: Audit every Server Action to verify `requireSession()`, `assertCan(session.role, permission)`, and `assertPatientBelongsToOrg(q, s.orgId, patientId)` before any mutation.
- **Acceptance Criteria & Verification:** `pnpm --filter @oncobrief/web test` and `E2E-003` (`security-boundaries.spec.ts`) pass with `0` unauthorized mutations.

---

### TASK-004: Govern Encounter Notes (`encounter_note_version`) and Tumor Board Cases (`tumor_board_case`) with Ledger Provenance & `checkTextForBoundary`
- **Priority:** `P0 — SAFETY & CLINICAL BOUNDARY` | **Depends On:** `TASK-002` | **Covers:** `REQ-031`, `REQ-040`, `REQ-041`
- **Files to Modify / Create:**
  - `packages/db/src/services/encounters.ts`
  - `packages/db/src/services/tumor-board.ts`
  - `apps/web/src/app/(app)/encounters/[encounterId]/page.tsx`
  - `apps/web/src/app/(app)/tumor-board/page.tsx`
  - `packages/db/src/seed.ts`
  - `apps/web/e2e/clinical-encounters-and-mdt.spec.ts` (new)
- **Implementation Specification:**
  1. In `packages/db/src/services/encounters.ts`: Run `checkTextForBoundary()` on `subjectiveText`, `objectiveText`, `assessmentText`, `planText`, and `addendumText` before inserting into `encounter_note_version`. Pass `consultationPacketId`, `citedFactIds` (`uuid[]`), and `noteGovernanceKind` (`'ledger_anchored'`) to satisfy the `0020` trigger `validate_encounter_note_governance()`.
  2. In `packages/db/src/services/tumor-board.ts`: Run `checkTextForBoundary()` on `tnmStaging`, `consensusSummary`, `treatmentPlan`, and `clinicalTrialMatches`. Require `stagingFactId` when `tnmStaging` is provided (verifying it matches `evidence_fact.value_json->>'asWritten'` verbatim) and require `citedFactIds` (`cardinality >= 1`) when `consensusSummary` or `treatmentPlan` is provided, satisfying `validate_tumor_board_case_governance()`.
  3. In `encounters/[encounterId]/page.tsx` and `tumor-board/page.tsx`: Add a **Ledger Fact & Approved Packet Citation Selector** so clinicians select the patient's verified `stage_text.as_written` fact (`[E#]`) and cited evidence facts when recording encounter notes or MDT administrative consensus, with explicit UI labels: `"Administrative Coordination & Documented Record Summary (Non-Prescriptive)"`.
  4. Update `packages/db/src/seed.ts` so seeded `encounter_note_version` and `tumor_board_case` rows supply valid `staging_fact_id`, `consultation_packet_id`, and `cited_fact_ids`.
- **Acceptance Criteria & Verification:** `pnpm boundary:check`, `pnpm --filter @oncobrief/db test`, and `E2E-013` pass.

---

### TASK-005: Wire `WorkflowStateGraph` into Document Ingestion Pipeline (`ingestDocument`) with Persisted Checkpoints & Dynamic OCR/Extractor Routing
- **Priority:** `P0 — CORE ARCHITECTURE` | **Depends On:** `TASK-002` | **Covers:** `REQ-013`, `REQ-015`, `REQ-026`
- **Files to Modify / Create:**
  - `packages/domain/src/orchestration/workflow-graph.ts`
  - `packages/db/src/services/documents.ts`
  - `packages/adapters/src/factory.ts` (new or update existing adapter wiring in `apps/web/src/lib/actions.ts`)
  - `packages/domain/test/workflow-graph.test.ts`
- **Implementation Specification:**
  1. Refactor `createDocumentIngestionWorkflowGraph` in `packages/domain/src/orchestration/workflow-graph.ts` so its nodes accept async execution callbacks (`triageNode` → `ocrRouteNode` → `segmentPacketNode` → `classifyNode` → `extractCandidatesNode` → `twoStageSpanGateNode` → `dateScopedConflictAndDeltaNode` → `humanReviewInterruptGate`).
  2. In `packages/db/src/services/documents.ts`: Execute `documentIngestionWorkflowGraph.run(...)` inside `ingestDocument` / `ingestNormalizedPages` and record `visitedNodes`, `checkpoints`, `ocrEngine`, `extractorKind`, and `providerMode` (`'live' | 'sandbox' | 'fallback'`) in `audit_event.metadata_json` (`action = 'document.ingested'`).
  3. Centralize dynamic adapter selection (`createIngestionDepsFromEnv()`) so `OCR_DRIVER` (`sarvam` | `textract` | `local`) and `EXTRACTOR_DRIVER` (`bedrock` | `nvidia` | `rule`) are honored consistently across both `apps/web/src/lib/actions.ts` and API route handlers, with automatic fallback to `LocalMultimodalOcrAdapter` / `RuleBasedExtractor` if cloud credentials are missing or return a network error.
- **Acceptance Criteria & Verification:** `pnpm --filter @oncobrief/domain test -- workflow-graph.test.ts` and `pnpm --filter @oncobrief/db test -- ingestion.test.ts` pass.

---

### TASK-007: Unify Milestone B `appointment` Table with V4 `opd_appointment_slot` Queue Board & Seed Cohesive Today's OPD Schedule
- **Priority:** `P1 — HIGH` | **Depends On:** `TASK-002` | **Covers:** `REQ-019`, `REQ-039`, `REQ-048`
- **Files to Modify:**
  - `packages/db/src/services/opd.ts`
  - `packages/db/src/services/appointments.ts`
  - `packages/db/src/seed.ts`
  - `apps/web/src/app/(app)/appointments/page.tsx`
- **Implementation Specification:**
  1. Using `opd_appointment_slot.appointment_id` (added in `0020_remediation_rls_and_governance.sql`), update `updateOpdSlotStatus`, `registerOpdWalkIn`, and `appointments.ts` (`updateAppointmentStatus`, `createAppointment`) so status changes synchronize bidirectionally between `opd_appointment_slot` and `appointment` inside the same PostgreSQL transaction.
  2. Update `packages/db/src/seed.ts` so every seeded today's OPD slot for `DEMO-001`, `DEMO-002`, and `DEMO-003` has a linked `appointment` row (`appointment_id`), ensuring `/workspace?view=flow` and `/appointments` show the exact same clinic schedule, room labels, token numbers, and arrival states.
- **Acceptance Criteria & Verification:** Checking in a patient on `/workspace?view=flow` updates `/appointments` immediately, verified by `E2E-007`.

---

### TASK-009: Upgrade `Ask OncoBrief` Assistant to Stateful Multi-Step Agentic Co-Pilot (`assistantQueryWorkflowGraph`) with Confirmation-Gated Action Proposals & Persisted Traces
- **Priority:** `P1 — HIGH` | **Depends On:** `TASK-002` | **Covers:** `REQ-023`, `REQ-024`, `REQ-026`, `REQ-064`
- **Files to Modify:**
  - `packages/domain/src/orchestration/workflow-graph.ts`
  - `apps/web/src/lib/assistant/classify.ts`
  - `apps/web/src/lib/assistant/tools.ts`
  - `apps/web/src/lib/assistant/orchestrator.ts`
  - `apps/web/src/components/AssistantDrawer.tsx`
  - `apps/web/src/app/api/v1/assistant/chat/route.ts`
  - `apps/web/src/app/api/v1/assistant/confirm-action/route.ts` (new)
- **Implementation Specification:**
  1. Wire `assistantQueryWorkflowGraph` into `runAssistantTurn()` (`apps/web/src/lib/assistant/orchestrator.ts`).
  2. Add `'workflow_action_request'` intent in `classify.ts` for prompts such as *"Create a task to follow up on pending IHC"* or *"Draft a specialist referral letter for this patient"*.
  3. When `'workflow_action_request'` is triggered, `actionProposalNode` builds an `AssistantPendingActionProposal` (`create_task`, `assign_task`, or `generate_studio_draft`) anchored to `[E#]`/`[G#]` citations and stores it in `chat_message.pending_action_json` (`status: 'awaiting_confirmation'`), along with `execution_trace_json` and `provider_mode` (`'live_bedrock' | 'deterministic_grounded'`).
  4. In `AssistantDrawer.tsx`: Render an interactive **Proposed Action Confirmation Card** (`Confirm & Execute` / `Cancel`) and a collapsible **Agent Execution Trace (`visitedNodes`)** pill. Clicking `Confirm & Execute` calls `POST /api/v1/assistant/confirm-action`, which executes the task/draft creation under `withSession()`, updates `pending_action_json.status = 'confirmed'`, and appends an `audit_event`.
- **Acceptance Criteria & Verification:** `E2E-009` (`assistant-action-gate.spec.ts`) verifies zero silent mutations and 1-click confirmed execution.

---

### TASK-010: Remediate Clinical Context View (`ClinicalContextView.tsx`) & `TimelineNodeView.tsx` to Eliminate Unanchored Synthetic Lab Fallbacks for Real Patients
- **Priority:** `P1 — HIGH (CLINICAL SAFETY)` | **Depends On:** `TASK-001` | **Covers:** `REQ-006`, `REQ-060`
- **Files to Modify:**
  - `apps/web/src/components/ClinicalContextView.tsx`
  - `apps/web/src/components/TimelineNodeView.tsx`
- **Implementation Specification:**
  1. Inspect `apps/web/src/components/ClinicalContextView.tsx` where hardcoded fallback arrays (`13.8 -> 12.6 -> 11.4 -> 10.2 g/dL` Hemoglobin, WBC, Platelets, Creatinine, CEA) are currently rendered when a patient has no matching lab facts in `rows`.
  2. Replace the unconditional synthetic fallback in `ClinicalContextView.tsx` so that:
     - Only actual `evidence_fact` rows (`factType === 'lab_result.as_written'`) belonging to the current `patientId` are plotted in the longitudinal lab trend charts and tables, with every data point linked to its `evidenceFactId`, `documentName`, and `pageNumber`.
     - If a patient has `0` extracted or verified lab facts for a biomarker, render an explicit `EmptyFinding` card (`"No documented <Biomarker> results in Evidence Ledger for this patient"`), never fabricated numbers.
  3. In `TimelineNodeView.tsx`, verify that facility fallback reads `'Facility not stated'` and modality labels derive strictly from `row.factType` / `row.documentName` / `row.verbatimQuote`.
- **Acceptance Criteria & Verification:** Creating a new patient with 0 lab documents renders 0 synthetic lab values on `/patients/[id]/evidence`, verified in `E2E-004`.

---

### TASK-012: Implement 11-Language Indic Continuity Templates, `SarvamTranslationAdapter` (`/translate`), and Audible Multi-Tone WAV Fallback for TTS Preview
- **Priority:** `P1 — HIGH` | **Depends On:** `TASK-002` | **Covers:** `REQ-029`, `REQ-030`, `REQ-057`
- **Files to Modify / Create:**
  - `packages/adapters/src/sarvam-translation.ts` (new)
  - `packages/adapters/src/sarvam-speech.ts`
  - `packages/adapters/src/simulated.ts`
  - `packages/adapters/src/index.ts`
  - `packages/db/src/seed.ts`
  - `apps/web/src/components/ContinuityAudioPlayer.tsx`
  - `apps/web/src/app/api/v1/assistant/voice/tts/route.ts`
- **Implementation Specification:**
  1. Create `SarvamTranslationAdapter` in `packages/adapters/src/sarvam-translation.ts` implementing `TranslationPort` via `POST https://api.sarvam.ai/translate` (`model: 'mayura:v1'`, mapping OncoBrief locales `en`, `hi`, `ta`, `te`, `bn`, `mr`, `kn`, `ml`, `gu`, `pa`, `or` to BCP-47 `en-IN`, `hi-IN`, `ta-IN`, `te-IN`, `bn-IN`, `mr-IN`, `kn-IN`, `ml-IN`, `gu-IN`, `pa-IN`, `od-IN`), with automatic fallback to `DeterministicTemplateTranslationAdapter` when `SARVAM_API_KEY` is unset.
  2. In `packages/db/src/seed.ts` and `DeterministicTemplateTranslationAdapter`: Seed complete, native-script oncology appointment reminder, pre-consultation checklist, and OPD slot offer templates across **all 11 supported languages** (`English`, `हिन्दी`, `தமிழ்`, `తెలుగు`, `বাংলা`, `मराठी`, `ಕನ್ನಡ`, `മലയാളം`, `ગુજરાતી`, `ਪੰਜਾਬੀ`, `ଓଡ଼ିଆ`).
  3. In `packages/adapters/src/sarvam-speech.ts` and `/api/v1/assistant/voice/tts/route.ts`: Replace the silent `buf.fill(0, 44)` fallback with `generateAudibleFallbackWav(text, locale)` that generates a 1.5-second 16-bit PCM WAV containing a warm 3-note prosodic chime (`440Hz -> 554.37Hz -> 659.25Hz` with ADSR envelope, `maxAmplitude > 12000`) and returns `providerMode: 'fallback_wav_chime'` so `ContinuityAudioPlayer.tsx` both plays audible WAV bytes AND invokes browser `window.speechSynthesis` in the target Indic locale when `SARVAM_API_KEY` is absent.
- **Acceptance Criteria & Verification:** `pnpm --filter @oncobrief/adapters test` and `E2E-011` verify non-silent audio (`maxAmplitude > 1000`) and native-script rendering across all 11 locales.

---

## Wave 2 — Feature Completion, Browser Extension, Multi-Report Segmentation, Guideline PDF Upload & Agents (Parallelizable)

### TASK-006: Implement Real Local Raster Image OCR (`tesseract.js` / CLI fallback) in `LocalMultimodalOcrAdapter` & Remove Unconditional Sidecar Bypass
- **Priority:** `P1 — HIGH` | **Depends On:** `TASK-005` | **Covers:** `REQ-012`, `REQ-014`
- **Files to Modify:**
  - `packages/adapters/src/local-multimodal-ocr.ts`
  - `packages/adapters/test/multimodal-ocr.test.ts`
- **Implementation Specification:**
  1. In `packages/adapters/src/local-multimodal-ocr.ts` (`extractImage`): Add real OCR text and bounding-box extraction for raster images (`image/png`, `image/jpeg`, `image/tiff`, `image/webp`) by invoking local `tesseract` CLI (if available on PATH with `--psm 6 tsv`) or embedded pure-JS/PNG tEXt/iTXt + OCR parser, falling back to `ocr_manual_transcription_required` quarantine only when an image has zero recognizable text and no sidecar.
  2. Restrict `.ocr.txt` sidecar lookup strictly to when `allowFixtureSidecar === true` (demo seed mode) so production uploads never blindly trust an unverified `.ocr.txt` file on disk.
- **Acceptance Criteria & Verification:** Uploading a PNG/JPEG lab report extracts real `text_span` rows with normalized `[0,1]` bounding boxes (`E2E-005`).

---

### TASK-008: Complete Readiness-Gated OPD Slot Backfill Workflow: Bounded OPD Coordination Agent, Notification Dispatch (`offerOpdSlot`), and Two-Step Offer Acceptance (`acceptOpdSlotOffer` / `releaseOpdSlotOffer`)
- **Priority:** `P1 — HIGH` | **Depends On:** `TASK-007` | **Covers:** `REQ-020`, `REQ-021`, `REQ-026`, `REQ-056`
- **Files to Modify:**
  - `packages/domain/src/orchestration/workflow-graph.ts`
  - `packages/db/src/services/opd.ts`
  - `apps/web/src/lib/actions.ts`
  - `apps/web/src/components/OpdFlowBoard.tsx`
  - `packages/db/test/opd.test.ts` (new or update)
- **Implementation Specification:**
  1. Wire `opdBackfillWorkflowGraph` into `packages/db/src/services/opd.ts`.
  2. Update `offerOpdSlot(q, input)` so that instead of immediately overwriting `opd_appointment_slot.patient_id`, it:
     - Runs `opdBackfillWorkflowGraph` to verify the candidate patient's `readiness_band === 'ready'` and `open_conflict_count === 0`.
     - Sets `opd_waitlist_entry.status = 'offered'` and `offered_slot_id = input.slotId`.
     - Automatically inserts a localized `patient_message` (`template_code = 'opd_slot_offer_v1'`) in the patient's `primary_language` (and caregiver contact if registered) notifying them of the offered OPD slot time and room.
     - Appends an `audit_event` (`action = 'opd.slot_offered'`) with the `opdBackfillWorkflowGraph` execution trace.
  3. Add `acceptOpdSlotOffer(q, input)` and `releaseOpdSlotOffer(q, input)` in `packages/db/src/services/opd.ts` (and `acceptOpdSlotOfferAction` / `releaseOpdSlotOfferAction` in `actions.ts`) and render **Accept Offer (Assign Slot)** and **Decline / Release Offer** buttons in `OpdFlowBoard.tsx`.
- **Acceptance Criteria & Verification:** `E2E-007` (`opd-flow-and-backfill.spec.ts`) verifies the complete `waiting -> offered (+ patient_message created) -> slotted (+ appointment synced)` lifecycle.

---

### TASK-011: Wire `PatientSnapshotHeader.tsx` Alert Banners Dynamically to Live Unresolved Ledger Conflicts, Missing Critical Checklist Items, and Overdue Tasks
- **Priority:** `P1 — HIGH` | **Depends On:** `TASK-001`, `TASK-004` | **Covers:** `REQ-038`
- **Files to Modify:**
  - `apps/web/src/app/(app)/patients/[id]/layout.tsx`
  - `apps/web/src/components/PatientSnapshotHeader.tsx`
- **Implementation Specification:**
  1. In `apps/web/src/app/(app)/patients/[id]/layout.tsx`: Compute dynamic `alertBanners` from the patient's live ledger state (`summary.openConflictCount`, `summary.missingCriticalCount`, overdue `admin_task` count, and `delayed_investigation` OPD slot status) and pass `alertBanners` to `<PatientSnapshotHeader />`.
  2. Each banner includes a direct clickable action link (e.g., `"1 Unresolved Source Contradiction — Open Reconciliation Room"` → `/patients/[id]/conflicts`, `"2 Missing Critical Readiness Documents — View Record Map"` → `/patients/[id]/record-map`).
- **Acceptance Criteria & Verification:** Resolving a conflict in the Reconciliation Room immediately removes the conflict alert banner in `PatientSnapshotHeader` (`E2E-004`).

---

### TASK-013: Eliminate Synthetic Fallback Metrics in `/analytics` & `/workspace` Telemetry Bar and Compute Live Ledger/OPD Operational KPIs
- **Priority:** `P1 — HIGH` | **Depends On:** `TASK-007` | **Covers:** `REQ-042`, `REQ-065`
- **Files to Modify:**
  - `packages/db/src/services/analytics.ts`
  - `apps/web/src/app/(app)/analytics/page.tsx`
  - `apps/web/src/app/(app)/workspace/page.tsx`
- **Implementation Specification:**
  1. In `packages/db/src/services/analytics.ts`: Remove all synthetic ternary fallback numbers (`totalEncounters > 0 ? ... : 14`, `68`, `42`, etc.). Query live counts from `patient_twin_summary`, `extraction_candidate` (Span-Validation Gate pass rate = `promoted / total`), `conflict_group` (pre-consult contradictions caught and resolved), `opd_appointment_slot` (slot utilization & backfills), `admin_task` (task completion & assignment rate), and `encounter` / `appointment`.
  2. On `/workspace` and `/analytics`: Display both the **Live Database Measurement** and the **60–90 Day Pilot Target Benchmark** (from `ONCOBRIEF_ENHANCEMENT_PLAN.md` §1.2) clearly labeled so judges see real database telemetry alongside pilot OKR targets.
- **Acceptance Criteria & Verification:** Running a query against `analytics.ts` on an empty org returns `0` (never `14` or `68`), and seeding demo data populates exact live database counts (`E2E-007`).

---

### TASK-016: Build Manifest V3 EHR Browser Extension (`apps/extension`) & Short-Lived `extension_grant` Capture API (`/api/v1/patients/[id]/extension-grants`, `/api/v1/extension/capture`)
- **Priority:** `P1 — MANDATORY V4 SCOPE (REQ-034)` | **Depends On:** `TASK-003`, `TASK-005` | **Covers:** `REQ-034`
- **Files to Create / Modify:**
  - `apps/extension/manifest.json` (new — Chrome/Edge Manifest V3)
  - `apps/extension/popup.html` (new)
  - `apps/extension/popup.js` (new)
  - `apps/extension/content-script.js` (new)
  - `apps/extension/background.js` (new)
  - `packages/db/src/services/extension-grants.ts` (new)
  - `packages/db/src/index.ts` (export `extension-grants.ts`)
  - `apps/web/src/app/api/v1/patients/[id]/extension-grants/route.ts` (new)
  - `apps/web/src/app/api/v1/extension/capture/route.ts` (new)
  - `apps/web/src/components/DocumentUploadForm.tsx` (add "Launch EHR Browser Extension Capture" grant generator panel)
  - `apps/web/e2e/browser-extension-capture.spec.ts` (new)
- **Implementation Specification:**
  1. **Database Service (`packages/db/src/services/extension-grants.ts`):**
     - `issueExtensionGrant(q, { orgId, userId, patientId, scope, origin, ttlSeconds })`: Enforces `ttlSeconds <= 600` (matching `CHECK (expires_at <= created_at + INTERVAL '10 minutes')` in `0002_schema.sql:417`), generates a 32-byte random token `ob_ext_<base64url>`, computes `tokenHash = createHash('sha256').update(token).digest()`, inserts into `extension_grant`, appends an `audit_event` (`action = 'extension.grant_issued'`), and returns `{ grantId, token, expiresAt, patientId }`.
     - `consumeExtensionGrant(q, { token, requiredScope })`: Computes `tokenHash = createHash('sha256').update(token).digest()`, executes an atomic `UPDATE extension_grant SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() AND $2 = ANY(scope) RETURNING id, org_id, user_id, patient_id, scope, origin`, sets `SELECT set_config('app.org_id', org_id::text, true)` and `set_config('app.user_id', user_id::text, true)`, and returns the grant context (or throws `'extension_grant_invalid_or_expired'`).
  2. **API Endpoints:**
     - `POST /api/v1/patients/[id]/extension-grants`: Requires authenticated session with `document:upload` permission; calls `issueExtensionGrant` and returns the short-lived token + one-click extension deep-link payload.
     - `POST /api/v1/extension/capture`: Accepts `Authorization: Bearer <token>` and JSON/multipart payload `{ filename, mimeType, contentBase64, pageTitle, ehrUrl, issuingFacility, documentDate }`; calls `consumeExtensionGrant` inside a DB transaction, calls `createDocument(..., { sourceKind: 'extension_capture' })` + `ingestDocument()`, and returns `{ documentId, status, promotedFactsCount, redirectUrl: '/patients/[id]/sources/[docId]' }`.
  3. **Manifest V3 Browser Extension (`apps/extension/`):**
     - `manifest.json`: `"manifest_version": 3`, permissions `["activeTab", "scripting", "storage"]`, action popup `popup.html`, background service worker `background.js`, content script `content-script.js`.
     - `content-script.js`: Extracts selected clinical report text, structured FHIR/table DOM nodes, page title, and hospital origin from the active EHR tab without modifying the host EHR page.
     - `popup.html` & `popup.js`: Allows the clinician/coordinator to paste or auto-fill the 10-minute `extension_grant` token (issued from `/patients/[id]/sources`), preview the captured EHR report text, and click **"Capture & Ingest into OncoBrief Ledger"** (`POST /api/v1/extension/capture`).
  4. **Workspace UI Integration (`DocumentUploadForm.tsx`):** Add a **"Browser Extension Capture (10-Min Grant)"** card in `DocumentUploadForm.tsx` that mints a live `extension_grant` token and provides a 1-click **"Simulate EHR Extension Capture"** button for browser testing alongside the installable `apps/extension` package.
- **Acceptance Criteria & Verification:** `E2E-006` (`browser-extension-capture.spec.ts`) verifies grant minting, `extension_capture` document ingestion, and single-use token replay rejection (`401`).

---

### TASK-017: Wire Multi-Report Packet Segmentation (`segmentDocumentPacket`) into Document Ingestion (`0021_complete_v4_scope.sql`, `documents.ts`) & Render Sub-Document Packet Breakdown on `/sources`
- **Priority:** `P1 — MANDATORY V4 SCOPE (REQ-055)` | **Depends On:** `TASK-005` | **Covers:** `REQ-055`, `REQ-012`, `REQ-048`
- **Files to Create / Modify:**
  - `packages/db/migrations/0021_complete_v4_scope.sql` (new)
  - `packages/db/src/services/documents.ts`
  - `packages/db/src/seed.ts`
  - `apps/web/src/app/(app)/patients/[id]/sources/page.tsx`
  - `apps/web/src/app/(app)/patients/[id]/sources/[docId]/page.tsx`
  - `apps/web/e2e/multi-modal-and-segmentation.spec.ts` (new)
- **Implementation Specification:**
  1. Create `packages/db/migrations/0021_complete_v4_scope.sql` defining table `document_subpacket`:
     ```sql
     CREATE TABLE IF NOT EXISTS document_subpacket (
       id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       org_id           uuid NOT NULL REFERENCES organization(id),
       patient_id       uuid NOT NULL REFERENCES patient(id),
       document_id      uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
       subpacket_index  integer NOT NULL,
       start_page       integer NOT NULL CHECK (start_page >= 1),
       end_page         integer NOT NULL CHECK (end_page >= start_page),
       category         text NOT NULL,
       stated_date      date,
       stated_facility  text,
       confidence       real NOT NULL DEFAULT 0.8,
       created_at       timestamptz NOT NULL DEFAULT now(),
       UNIQUE (document_id, subpacket_index)
     );
     ALTER TABLE document_subpacket ENABLE ROW LEVEL SECURITY;
     ALTER TABLE document_subpacket FORCE ROW LEVEL SECURITY;
     DROP POLICY IF EXISTS tenant_isolation ON document_subpacket;
     CREATE POLICY tenant_isolation ON document_subpacket
       USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
       WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
     GRANT SELECT, INSERT, UPDATE, DELETE ON document_subpacket TO oncobrief_app;
     ```
  2. In `packages/db/src/services/documents.ts` (`ingestNormalizedPages`): Call `segmentDocumentPacket(pages.map(p => ({ pageNumber: p.pageNumber, text: p.plainText })))` from `@oncobrief/domain`, insert each `PacketSubDocument` into `document_subpacket`, and expose `listDocumentSubpackets(q, orgId, documentId)`. When a multi-page packet contains distinct `statedDate` or `statedFacility` values per sub-document, pass the page-appropriate `documentDate` and `issuingFacility` to `extractor.extract()` per sub-document so facts extracted from Page 2 inherit Page 2's date and facility!
  3. On `/patients/[id]/sources/page.tsx` and `/patients/[id]/sources/[docId]/page.tsx`: Render a **"Segmented Packet Sub-Documents"** badge and expandable breakdown table (`Sub-Report # | Pages | Detected Category | Stated Date | Stated Facility | Confidence`) with 1-click page jump links (`?page=<startPage>`).
- **Acceptance Criteria & Verification:** `E2E-005` uploads a 3-page combined referral packet PDF and verifies 3 `document_subpacket` rows are persisted and rendered on `/sources`.

---

### TASK-018: Implement Interactive Guideline / SOP PDF Upload (`ingestGuidelineDocumentPdf`) & Dedicated `[G#]` Guideline Source Viewer (`?guideline=<id>&page=<n>&span=<id>`)
- **Priority:** `P1 — MANDATORY V4 SCOPE (REQ-024, REQ-051)` | **Depends On:** `TASK-005`, `TASK-009` | **Covers:** `REQ-024`, `REQ-051`
- **Files to Modify / Create:**
  - `packages/db/src/services/studio.ts`
  - `apps/web/src/lib/actions.ts` (add `uploadGuidelinePdfAction`)
  - `apps/web/src/components/GuidelineLibraryPanel.tsx` (new)
  - `apps/web/src/app/(app)/patients/[id]/packet/page.tsx`
  - `apps/web/src/app/(app)/patients/[id]/sources/page.tsx`
  - `apps/web/e2e/guideline-upload-and-rag.spec.ts` (new)
- **Implementation Specification:**
  1. In `packages/db/src/services/studio.ts`: Add `ingestGuidelineDocumentPdf(q, ocrPort, input: { orgId, uploadedBy, code, title, issuingBody, versionLabel, publicationDate, bytes, mimeType })` and `getGuidelineWithSpans(q, orgId, guidelineId)`. It computes `content_sha256`, runs `ocrPort.extractDocument` (or `LocalMultimodalOcrAdapter`) to extract pages and block spans with bounding boxes, inserts into `guideline_document` and `guideline_span`, and logs a `guideline.uploaded` audit event.
  2. Create `GuidelineLibraryPanel.tsx` and mount it on `/patients/[id]/packet/page.tsx` (above or beside `ProductivityStudio`), displaying all active institutional/NCG guidelines in `guideline_document`, their span counts, version labels, and an interactive **"Upload Institutional SOP / NCG Guideline PDF"** form (`uploadGuidelinePdfAction`).
  3. In `apps/web/src/app/(app)/patients/[id]/sources/page.tsx`: Inspect `searchParams.guideline`, `searchParams.page`, and `searchParams.span`. When `searchParams.guideline` is present, fetch the guideline via `getGuidelineWithSpans(q, s.orgId, searchParams.guideline)` and render a dedicated **Reference Guideline & SOP Source Viewer** at the top of `/sources` showing the exact page, highlighted bounding box (`bbox_x`, `bbox_y`, `bbox_w`, `bbox_h`), verbatim text, and the mandatory non-clinical header `Reference Guideline Extract — For Clinician Review Only (Not a Patient-Specific Order)`.
- **Acceptance Criteria & Verification:** `E2E-008` (`guideline-upload-and-rag.spec.ts`) uploads a guideline PDF, queries it in `Ask OncoBrief`, clicks `[G1]`, and verifies the highlighted span in the Guideline Source Viewer.

---

### TASK-022: Wire Interactive `withdrawPacketAction` on `/packet`, Verify `waiveGapAction` on `/record-map`, and Add Task Due-Date / Escalation Controls on `/tasks`
- **Priority:** `P1 — HIGH` | **Depends On:** `TASK-003` | **Covers:** `REQ-011`, `REQ-022`, `REQ-054`
- **Files to Modify:**
  - `apps/web/src/app/(app)/patients/[id]/packet/page.tsx`
  - `apps/web/src/app/(app)/patients/[id]/record-map/page.tsx`
  - `apps/web/src/app/(app)/patients/[id]/tasks/page.tsx`
- **Implementation Specification:**
  1. In `apps/web/src/app/(app)/patients/[id]/packet/page.tsx`: Import `withdrawPacketAction` from `@/lib/actions` and render a collapsible `<details>` **"Withdraw Packet"** form (requiring `canApprove` and a mandatory `reason` input `>= 10 chars`, `data-testid="withdraw-packet-form"`) for any `draft`, `pending_approval`, or `approved` packet.
  2. In `apps/web/src/app/(app)/patients/[id]/record-map/page.tsx`: Ensure the `waiveGapAction` form has explicit accessible labels, `data-testid="waive-gap-form"`, and renders the waived reason and actor name once waived.
  3. In `apps/web/src/app/(app)/patients/[id]/tasks/page.tsx`: Display task `priority` (`urgent` | `high` | `normal` | `low`), `due_at` badges, and allow updating priority/assignee in-row.
- **Acceptance Criteria & Verification:** `E2E-010` verifies packet withdrawal (`status = 'withdrawn'`) and checklist gap waiver (`status = 'waived'`).

---

### TASK-023: Implement Bounded Continuity Attendance Agent (`continuityOutreachWorkflowGraph`) & Two-Way Inbound Patient/Caregiver Reply Webhook (`/api/v1/continuity/webhook`)
- **Priority:** `P1 — MANDATORY V4 SCOPE (REQ-028, REQ-057)` | **Depends On:** `TASK-008`, `TASK-012` | **Covers:** `REQ-027`, `REQ-028`, `REQ-057`
- **Files to Create / Modify:**
  - `packages/domain/src/orchestration/workflow-graph.ts`
  - `packages/db/src/services/continuity.ts`
  - `apps/web/src/app/api/v1/continuity/webhook/route.ts` (new)
  - `apps/web/src/app/(app)/patients/[id]/continuity/page.tsx`
- **Implementation Specification:**
  1. Add `createContinuityOutreachWorkflowGraph()` in `packages/domain/src/orchestration/workflow-graph.ts` (`selectVerifiedFactsNode` → `translateAndRender11LocaleNode` → `synthesizeVoiceNoteNode` → `clinicianOutreachApprovalGate` → `processInboundPatientReplyNode`).
  2. Create `POST /api/v1/continuity/webhook` (`apps/web/src/app/api/v1/continuity/webhook/route.ts`) accepting `{ orgId, messageId, responderKind: 'patient' | 'caregiver', responseAction: 'confirm_attendance' | 'request_reschedule' | 'confirm_documents_ready' | 'accept_slot_offer' | 'decline_slot_offer', rawReplyText }` (authenticated via HMAC header `x-oncobrief-webhook-signature` or session auth for in-app simulation).
  3. When `responseAction === 'confirm_attendance'`, `continuityOutreachWorkflowGraph` updates `patient_message.confirmation_status`, marks the patient's today's `opd_appointment_slot` note with `'Patient confirmed attendance'`, and appends an `audit_event`. When `responseAction === 'request_reschedule'`, it creates an `admin_task` (`'Coordinator: Patient requested appointment reschedule'`) so no reschedule request is ever lost. When `responseAction === 'accept_slot_offer'`, it invokes `acceptOpdSlotOffer()`.
- **Acceptance Criteria & Verification:** `E2E-011` (`continuity-voice-11-locales.spec.ts`) tests both outbound 11-locale voice dispatch and inbound webhook attendance/reschedule processing.

---

## Wave 3 — Studio Polish, External Adapters, WCAG 2.2 AA & 375px Mobile Gate (Parallelizable)

### TASK-014: Surface Explicit Runtime Provider & Simulation Transparency Badges (`Live` vs `Sandbox` vs `Fallback`) Across Upload, Assistant, Voice, and ABDM Surfaces
- **Priority:** `P1 — HIGH` | **Depends On:** `TASK-005`, `TASK-009`, `TASK-012` | **Covers:** `REQ-049`, `REQ-065`
- **Files to Create / Modify:**
  - `apps/web/src/components/ProviderModeBadge.tsx` (new)
  - `apps/web/src/components/DocumentUploadForm.tsx`
  - `apps/web/src/components/AssistantDrawer.tsx`
  - `apps/web/src/app/(app)/patients/[id]/continuity/page.tsx`
  - `apps/web/src/app/(app)/patients/[id]/packet/page.tsx`
- **Implementation Specification:**
  1. Create a reusable `<ProviderModeBadge capability="OCR" mode="live | sandbox | fallback" providerName="Sarvam Vision | Local Multimodal" />` component.
  2. Render explicit runtime provider mode badges on `DocumentUploadForm.tsx` (OCR, Extractor, and ABDM driver modes), `AssistantDrawer.tsx` (`Live Bedrock` vs `Deterministic Grounded Synthesis`), `continuity/page.tsx` (`Sarvam Bulbul v3 / Mayura` vs `Local 11-Locale Template + Audible WAV Fallback`, and `Webhook/Twilio Delivery` vs `Simulated In-App Outbox`), and `packet/page.tsx` (`ABDM Sandbox` vs `Simulated Loopback`).
- **Acceptance Criteria & Verification:** Every AI/external surface visibly and accurately states its active runtime mode (`E2E-016`).

---

### TASK-019: Remediate WCAG 2.2 AA Contrast, Form Labels, Landmarks, Focus Management & `aria-live` Regions + Add `@axe-core/playwright` Zero-Violation Suite
- **Priority:** `P1 — MANDATORY V4 SCOPE (REQ-045, REQ-052)` | **Depends On:** `TASK-010`, `TASK-011` | **Covers:** `REQ-045`, `REQ-052`
- **Files to Modify / Create:**
  - `apps/web/src/app/globals.css`
  - `apps/web/src/app/(app)/layout.tsx`
  - `apps/web/src/app/(app)/patients/[id]/layout.tsx`
  - `apps/web/src/components/DocumentUploadForm.tsx`
  - `apps/web/src/components/OpdFlowBoard.tsx`
  - `apps/web/src/app/(app)/appointments/page.tsx`
  - `apps/web/src/app/(app)/encounters/[encounterId]/page.tsx`
  - `apps/web/src/app/(app)/tumor-board/page.tsx`
  - `apps/web/e2e/wcag-accessibility.spec.ts` (new)
- **Implementation Specification:**
  1. **Contrast Ratios:** Verify `--color-state-extracted: #7c530b` (`6.12:1`) and `--color-rule-strong: #857d6f` (`3.45:1`) in `globals.css`. Replace low-contrast `text-slate-400` text labels in `TimelineNodeView.tsx`, `DocumentUploadForm.tsx`, `appointments/page.tsx`, and `tumor-board/page.tsx` with `text-slate-600` (`>= 4.5:1` on white/paper backgrounds).
  2. **Form Labels:** Add explicit `aria-label` or `htmlFor`/`id` bindings to every `<input>`, `<select>`, and `<textarea>` in `DocumentUploadForm.tsx`, `OpdFlowBoard.tsx`, `appointments/page.tsx`, `encounters/[encounterId]/page.tsx`, and `tumor-board/page.tsx` so `0` inputs are unlabeled.
  3. **Landmarks & Live Regions:** Ensure `<main id="main-content">` and a keyboard-focusable `"Skip to main content"` link exist in `apps/web/src/app/(app)/layout.tsx`, and ensure an `aria-live="polite"` status announcer exists for batch verification, slot backfill, and task updates.
  4. **Automated Axe Gate (`apps/web/e2e/wcag-accessibility.spec.ts`):** Run `@axe-core/playwright` (or deterministic DOM contrast + label + landmark audit if `@axe-core/playwright` is not installed in `node_modules`) across all 10 routes and assert `0` violations.
- **Acceptance Criteria & Verification:** `E2E-014` (`wcag-accessibility.spec.ts`) passes with `0` WCAG 2.2 AA violations.

---

### TASK-020: Remediate `375px` Mobile Viewport Overflow Across All 12 Workspace, Patient, and Milestone A/B Routes + Add Automated 375px Playwright Gate
- **Priority:** `P1 — MANDATORY V4 SCOPE (REQ-046, REQ-053)` | **Depends On:** `TASK-007`, `TASK-019` | **Covers:** `REQ-046`, `REQ-053`
- **Files to Modify / Create:**
  - `apps/web/src/app/(app)/layout.tsx`
  - `apps/web/src/app/(app)/patients/[id]/layout.tsx`
  - `apps/web/src/components/PatientTabs.tsx`
  - `apps/web/src/components/OpdFlowBoard.tsx`
  - `apps/web/src/components/TimelineNodeView.tsx`
  - `apps/web/src/app/(app)/workspace/page.tsx`
  - `apps/web/src/app/(app)/patients/page.tsx`
  - `apps/web/src/app/(app)/appointments/page.tsx`
  - `apps/web/src/app/(app)/encounters/[encounterId]/page.tsx`
  - `apps/web/src/app/(app)/tumor-board/page.tsx`
  - `apps/web/src/app/(app)/analytics/page.tsx`
  - `apps/web/e2e/mobile-375px.spec.ts` (new)
- **Implementation Specification:**
  1. Ensure the root authenticated shell in `apps/web/src/app/(app)/layout.tsx` sets `overflow-x-hidden max-w-[100vw]` and adds bottom padding `pb-24` so the fixed `AssistantLauncher` never covers interactive controls on small viewports.
  2. In `TimelineNodeView.tsx`: Make the left date rail responsive (`hidden sm:block w-[110px]` on desktop, inline date badge inside the card header on `< 640px` viewports) so cards have full width at `375px`.
  3. Wrap all wide tables in `/workspace`, `/workspace?view=flow` (`OpdFlowBoard`), `/patients`, `/appointments`, `/tumor-board`, `/analytics`, and `/patients/[id]/evidence` in `w-full max-w-full overflow-x-auto` containers with `min-w-0` parent flex/grid containers.
  4. Write `apps/web/e2e/mobile-375px.spec.ts` testing all 12 routes at `{ width: 375, height: 812 }` and asserting `document.documentElement.scrollWidth <= 375`.
- **Acceptance Criteria & Verification:** `E2E-015` (`mobile-375px.spec.ts`) passes with `scrollWidth <= 375` on all 12 routes.

---

### TASK-021: Complete All 4 Productivity Studio Deliverables (`referral_letter`, `tumor_board_deck` Slide View, `academic_case_abstract`, `patient_info_sheet`) with Interactive `[G#]` Guideline Picker
- **Priority:** `P1 — MANDATORY V4 SCOPE (REQ-025, REQ-054)` | **Depends On:** `TASK-018` | **Covers:** `REQ-025`, `REQ-054`, `REQ-063`
- **Files to Modify:**
  - `packages/domain/src/studio/draft-generator.ts`
  - `apps/web/src/components/ProductivityStudio.tsx`
  - `apps/web/src/app/(app)/patients/[id]/packet/page.tsx`
  - `apps/web/src/lib/actions.ts`
  - `packages/domain/test/draft-generator.test.ts`
- **Implementation Specification:**
  1. Pass the active institutional guidelines (`listGuidelineDocuments(q, s.orgId)`) from `packet/page.tsx` into `<ProductivityStudio />`.
  2. In `ProductivityStudio.tsx`: Add an interactive **Reference Guideline Citation Selector (`[G#]`)** allowing the clinician to select which institutional/NCG guidelines to cite when generating or editing a draft (`referral_letter`, `tumor_board_deck`, `academic_case_abstract`, `patient_info_sheet`), and add a **Print Slide Deck / Save PDF** button (`window.print()`) on the `Slides View` tab for `tumor_board_deck`.
  3. In `updateStudioArtifactAction` and `approveStudioArtifactAction`: Enforce `checkTextForBoundary(markdownBody)` and verify that when `artifactKind === 'academic_case_abstract'`, direct patient identifiers (patient full name, MRN, ABHA number, phone) do not appear in the markdown body (`isDeidentified === true`).
- **Acceptance Criteria & Verification:** `pnpm --filter @oncobrief/domain test -- draft-generator.test.ts` and `E2E-010` pass for all 4 formats.

---

### TASK-024: Implement Real HTTP / Twilio SMS & WhatsApp Outbound Delivery Adapter (`WebhookDeliveryAdapter` in `packages/adapters/src/webhook-delivery.ts`)
- **Priority:** `P1 — MANDATORY V4 SCOPE (REQ-059)` | **Depends On:** `TASK-012`, `TASK-023` | **Covers:** `REQ-059`
- **Files to Create / Modify:**
  - `packages/adapters/src/webhook-delivery.ts` (new)
  - `packages/adapters/src/index.ts`
  - `apps/web/src/lib/actions.ts`
  - `packages/adapters/test/webhook-delivery.test.ts` (new)
- **Implementation Specification:**
  1. Create `WebhookDeliveryAdapter` in `packages/adapters/src/webhook-delivery.ts` implementing `DeliveryPort` (`send(message)`):
     - Supports **Twilio REST mode** (`DELIVERY_DRIVER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM`) calling `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json` for `'sms'` and `'whatsapp'` channels (attaching the `Sarvam Bulbul v3` audio URL as `MediaUrl` when `prefers_voice_note` is enabled).
     - Supports **Generic HMAC Webhook mode** (`DELIVERY_DRIVER=webhook` with `DELIVERY_WEBHOOK_URL`, `DELIVERY_WEBHOOK_SECRET`) sending a JSON POST signed with `x-oncobrief-signature: sha256=<hmac>`.
     - Falls back gracefully to `SimulatedDeliveryAdapter` when `DELIVERY_DRIVER=simulated` or credentials are unconfigured.
- **Acceptance Criteria & Verification:** `packages/adapters/test/webhook-delivery.test.ts` verifies both Twilio REST and HMAC Webhook payloads against a local mock HTTP server (`E2E-016`).

---

### TASK-025: Complete End-to-End ABDM v6.5.0 M2 HIP Care Context Linking, M3 HIU Consent + Fidelius ECDH Decryption Pipeline, and `DocumentUploadForm` Interop Tabs
- **Priority:** `P1 — MANDATORY V4 SCOPE (REQ-018, REQ-058)` | **Depends On:** `TASK-005`, `TASK-014` | **Covers:** `REQ-016`, `REQ-017`, `REQ-018`, `REQ-058`
- **Files to Modify / Create:**
  - `packages/db/src/services/abdm.ts`
  - `packages/adapters/src/abdm-gateway.ts`
  - `apps/web/src/components/DocumentUploadForm.tsx`
  - `apps/web/src/app/(app)/patients/[id]/sources/page.tsx`
  - `apps/web/e2e/abdm-and-interoperability.spec.ts` (new)
- **Implementation Specification:**
  1. In `packages/db/src/services/abdm.ts` and `packages/adapters/src/abdm-gateway.ts`: Verify that M2 HIP Care Context linking (`linkPacketCareContext`) records the gateway mode (`'sandbox' | 'simulated'`), request ID, and timestamp, and that M3 HIU consent initiation (`initiateHiuConsent`), consent notification (`/api/v1/abdm/v0.5/consents/hiu/notify`), and encrypted health-information push (`/api/v1/abdm/v0.5/health-information/transfer` with Fidelius X25519 ECDH decryption in `packages/domain/src/interop/fidelius-crypto.ts`) run end-to-end and ingest decrypted FHIR bundles through `documentIngestionWorkflowGraph`.
  2. On `/patients/[id]/sources/page.tsx` and `DocumentUploadForm.tsx`: Display the live **ABDM M3 HIU Consent & Health Info Pull Status Table** directly inside Tab 2 (`Import from EHR / ABDM`) with a 1-click **"Simulate Patient Consent Grant & Encrypted HIP Push (Fidelius ECDH)"** trigger when in `simulated` mode (and live gateway status polling when in `sandbox` mode), plus verify Tab 3 (`Link to Existing`) duplicate search, link, and unlink actions.
- **Acceptance Criteria & Verification:** `E2E-012` (`abdm-and-interoperability.spec.ts`) passes end-to-end across Tab 2 (TMC bundle, AIIMS mCODE bundle, M3 HIU Fidelius ECDH pull), Tab 3 (duplicate link/unlink), and `/packet` M2 HIP Care Context linking.

---

### TASK-026: Implement External Provider Connectivity & Contract Verification Suite (`/api/v1/system/providers`, `provider-contracts.test.ts`, and Worker S3/SQS Parity Verification)
- **Priority:** `P1 — MANDATORY V4 SCOPE (REQ-049, REQ-059, REQ-061)` | **Depends On:** `TASK-005`, `TASK-012`, `TASK-024`, `TASK-025` | **Covers:** `REQ-013`, `REQ-015`, `REQ-049`, `REQ-059`, `REQ-061`
- **Files to Create / Modify:**
  - `apps/web/src/app/api/v1/system/providers/route.ts` (new)
  - `packages/adapters/test/provider-contracts.test.ts` (new)
  - `apps/worker/test/worker-parity.test.ts` (new or update existing worker test)
- **Implementation Specification:**
  1. Create `GET /api/v1/system/providers` returning the real-time status of all 8 external integration ports (`ocr`, `extractor`, `llm_copilot`, `tts`, `stt`, `translation`, `abdm_gateway`, `outbound_delivery`), including `configuredDriver`, `activeMode` (`'live' | 'sandbox' | 'fallback'`), `credentialsPresent` (`boolean`), and `verificationTier` (`'Code Complete' | 'Sandbox Verified' | 'Live Verified'`).
  2. Create `packages/adapters/test/provider-contracts.test.ts` testing every external adapter (`SarvamVisionOcrAdapter`, `SarvamSpeechAdapter`, `SarvamTranslationAdapter`, `BedrockLlmProvider`, `NvidiaNimExtractor`, `TextractOcrAdapter`, `SandboxAbdmAdapter`, `WebhookDeliveryAdapter`) against local mock HTTP endpoints (and optionally live endpoints when `RUN_LIVE_PROVIDER_TESTS=1`).
  3. Verify `apps/worker/src/index.ts` shares `ingestNormalizedPages` and `documentIngestionWorkflowGraph` parity with synchronous uploads.
- **Acceptance Criteria & Verification:** `pnpm --filter @oncobrief/adapters test -- provider-contracts.test.ts` and `E2E-016` pass 100%.

---

## Wave 4 — Full-System Verification & End-to-End Demo Gate

### TASK-015: Master 5-Layer Regression, Security, Clinical Boundary & End-to-End Demo Validation (`E2E-001` through `E2E-016`)
- **Priority:** `P0 — FINAL RELEASE GATE` | **Depends On:** `TASK-001` through `TASK-026` | **Covers:** `REQ-001` through `REQ-065`
- **Files to Modify / Verify:**
  - `packages/db/test/*.test.ts`
  - `packages/domain/test/*.test.ts`
  - `packages/adapters/test/*.test.ts`
  - `apps/web/e2e/*.spec.ts`
- **Verification Commands (Complete Gate):**
  ```bash
  pnpm -r typecheck
  pnpm lint
  pnpm boundary:check
  pnpm branding:check
  pnpm db:migrate
  pnpm db:seed
  pnpm --filter @oncobrief/domain test
  pnpm --filter @oncobrief/adapters test
  pnpm --filter @oncobrief/db test
  pnpm --filter @oncobrief/web test
  pnpm --filter @oncobrief/web test:e2e
  ```
- **Done Criteria:** All 65 requirements (`REQ-001`–`REQ-065`) and all 16 E2E suites (`E2E-001`–`E2E-016`) pass with `0` failures, `0` clinical boundary violations, `0` cross-tenant RLS leaks, `0` WCAG 2.2 AA violations, and `0px` horizontal overflow at `375px` mobile viewport width.
