# OncoBrief — Comprehensive Test, Accessibility, Mobile & Demo Validation Plan

- **Document Version:** 2.0 (Unified 100% Scope Edition — Covering `REQ-001`–`REQ-065` & `TASK-001`–`TASK-026`)
- **Target Repository:** `/Users/dhaanish/Documents/OncoBrief`
- **Active Branch:** `feat/v4-assessment-remediation`

---

## 1. Five-Layer Verification Architecture

Every requirement (`REQ-001`–`REQ-065`) and implementation task (`TASK-001`–`TASK-026`) is verified across five automated testing layers:

| Layer | Command | Target Package / Directory | Key Invariants Verified |
| :--- | :--- | :--- | :--- |
| **Layer 0: Static Type, Lint, Boundary & Branding Gates** | `pnpm -r typecheck && pnpm lint && pnpm boundary:check && pnpm branding:check` | Monorepo root (`scripts/check-clinical-boundary.ts`, `scripts/check-branding.ts`) | 0 TypeScript errors; 0 forbidden diagnostic/staging/prescribing identifiers; 0 prohibited prototype strings. |
| **Layer 1: Pure Domain Unit Suite** | `pnpm --filter @oncobrief/domain test` | `packages/domain/test/*.test.ts` | Readiness state machine (`TASK-001`), Two-Stage Span & Entailment gate, date-scoped lab/medication conflict comparators, `computeIntervalDelta`, `buildLongitudinalLabFlowsheet`, `segmentDocumentPacket` (`TASK-017`), `rankWaitlistCandidatesForSlot`, `draft-generator` (all 4 Studio formats + PHI redaction), Fidelius ECDH crypto, and `WorkflowStateGraph` (`TASK-005`, `TASK-008`, `TASK-009`, `TASK-023`). |
| **Layer 2: Multi-Modal & Cloud Adapter Contract Suite** | `pnpm --filter @oncobrief/adapters test` | `packages/adapters/test/*.test.ts` | `SarvamVisionOcrAdapter` (>10-page `pdf-lib` batching), `SarvamSpeechAdapter` (`bulbul:v3` TTS, `saaras:v3` STT, audible WAV fallback `maxAmplitude > 1000`), `SarvamTranslationAdapter` (11 Indic locales), `LocalMultimodalOcrAdapter` (PDF, FHIR, DICOM, vCard, raster image OCR), `RuleBasedExtractor`, `BedrockLlmProvider`, `NvidiaNimExtractor`, `SandboxAbdmAdapter`, and `WebhookDeliveryAdapter` (`provider-contracts.test.ts` in `TASK-026`). |
| **Layer 3: PostgreSQL RLS, Ledger & Governance Integration Suite** | `pnpm --filter @oncobrief/db test` | `packages/db/test/*.test.ts` | Forced RLS (`ENABLE + FORCE RLS`) under non-superuser `oncobrief_app` across all `0002`–`0021` tables (including all 14 Milestone A/B tables in `remediation-0020.test.ts` and `document_subpacket` in `0021`), `text_span` & `ledger_entry` immutability triggers, `validate_tumor_board_case_governance()` & `validate_encounter_note_governance()` triggers, `extension_grant` 10-minute single-use consumption (`TASK-016`), and SHA-256 hash chain verification (`verifyLedgerChain`, `verifyAuditChain`). |
| **Layer 4: Browser E2E, WCAG 2.2 AA & 375px Mobile Suite** | `pnpm --filter @oncobrief/web test:e2e` | `apps/web/e2e/*.spec.ts` | Complete user journeys (`E2E-001` through `E2E-016`), `@axe-core/playwright` zero-violation accessibility gate (`E2E-014`), and `375px` mobile viewport zero-overflow gate (`E2E-015`). |

---

## 2. Complete End-to-End Test Matrix (`E2E-001` through `E2E-016`)

| E2E ID | Spec File | Tasks Verified | Scenarios & Assertions |
| :--- | :--- | :--- | :--- |
| **E2E-001** | `apps/web/e2e/worklist-readiness.spec.ts` | `TASK-001` | Verifies `/workspace` readiness summary counts (`Ready`, `Gaps`, `Blocked`) and `?band=ready\|gaps\|blocked\|none` filters match `patient_twin_summary` with `0` occurrences of `'complete'`. |
| **E2E-002** | `packages/db/test/remediation-0020.test.ts` | `TASK-002` | Verifies `0` cross-tenant leaks across all 14 Milestone A/B tables under `oncobrief_app` and verifies DB triggers reject unanchored `tumor_board_case` and `encounter_note_version` rows. |
| **E2E-003** | `apps/web/e2e/security-boundaries.spec.ts` | `TASK-003` | Verifies middleware blocks unauthenticated requests with forged `x-middleware-subrequest` headers (`CVE-2025-29927`) and blocks unauthorized Server Action mutations. |
| **E2E-004** | `apps/web/e2e/longitudinal-journey.spec.ts` | `TASK-010`, `TASK-011`, `TASK-015` | Verifies `PatientSnapshotHeader` dynamic alert banners, **"Changes Since Last Visit"** delta banner & filter, **Longitudinal Lab Flowsheet** (dated CBC series with `0` false conflicts and `0` synthetic fallback rows for patients without labs), Reconciliation Room conflict resolution, and **1-Click Batch Verify** (`<= 4 clicks`). |
| **E2E-005** | `apps/web/e2e/multi-modal-and-segmentation.spec.ts` | `TASK-005`, `TASK-006`, `TASK-017` | Uploads a raster PNG lab report (verifying real local image OCR) and a 3-page combined referral packet PDF (verifying `segmentDocumentPacket` persists 3 `document_subpacket` rows rendered on `/patients/[id]/sources` with page ranges, categories, and stated facilities). |
| **E2E-006** | `apps/web/e2e/browser-extension-capture.spec.ts` | `TASK-016` | Mints a 10-minute `extension_grant` token via `POST /api/v1/patients/[id]/extension-grants`, posts a captured EHR report to `POST /api/v1/extension/capture` with `Authorization: Bearer <token>`, verifies ingestion with `source_kind = 'extension_capture'`, and asserts token replay returns `401`. |
| **E2E-007** | `apps/web/e2e/opd-flow-and-backfill.spec.ts` | `TASK-007`, `TASK-008`, `TASK-013` | Verifies `/workspace?view=flow` and `/appointments` synchronization, marks a slot `delayed_investigation`, runs **Smart Slot Backfill** (`opdBackfillWorkflowGraph`), offers the slot (`status = 'offered'` + `patient_message` queued), accepts the offer (`acceptOpdSlotOffer`), and verifies live `/analytics` & `/workspace` telemetry counts. |
| **E2E-008** | `apps/web/e2e/guideline-upload-and-rag.spec.ts` | `TASK-009`, `TASK-018` | Uploads a real NCG/SOP PDF via `GuidelineLibraryPanel` on `/patients/[id]/packet`, verifies `guideline_document` + `guideline_span` creation, asks `Ask OncoBrief` a protocol question, clicks the `[G1]` citation card, and verifies `/patients/[id]/sources?guideline=<id>&page=1&span=<id>` highlights the exact guideline bounding box. |
| **E2E-009** | `apps/web/e2e/assistant-action-gate.spec.ts` | `TASK-009` | Asks `Ask OncoBrief` to create a follow-up task, verifies `pending_action_json` confirmation card is rendered with zero prior DB write, clicks **Confirm & Execute**, verifies task creation + `execution_trace_json` badge, and verifies clinical boundary refusal on diagnostic/dosing queries. |
| **E2E-010** | `apps/web/e2e/productivity-studio-four-formats.spec.ts` | `TASK-021`, `TASK-022` | Generates, edits, and approves all 4 Studio formats (`referral_letter`, `tumor_board_deck` with Slide View, `academic_case_abstract` with PHI redaction, `patient_info_sheet`), attaches `[G1]` guideline citations, tests `withdrawPacketAction` on `/packet`, and tests `waiveGapAction` on `/record-map`. |
| **E2E-011** | `apps/web/e2e/continuity-voice-11-locales.spec.ts` | `TASK-012`, `TASK-023`, `TASK-024` | Registers a consented caregiver on `/patients/[id]/continuity`, previews reminders across all 11 Indic languages (`en`, `hi`, `ta`, `te`, `bn`, `mr`, `kn`, `ml`, `gu`, `pa`, `or`), plays spoken audio preview (`/api/v1/assistant/voice/tts` with `maxAmplitude > 1000`), dispatches via `DeliveryPort`, and triggers inbound confirmation/reschedule via `POST /api/v1/continuity/webhook`. |
| **E2E-012** | `apps/web/e2e/abdm-and-interoperability.spec.ts` | `TASK-025` | Verifies `DocumentUploadForm` Tab 2 (TMC ABDM bundle, AIIMS mCODE bundle, M3 HIU Consent Request + Fidelius ECDH encrypted push/decrypt), Tab 3 (`Link to Existing` duplicate search, link, and unlink), and `/packet` M2 HIP Care Context linking + ABDM/mCODE exports. |
| **E2E-013** | `apps/web/e2e/clinical-encounters-and-mdt.spec.ts` | `TASK-004` | Verifies governed Encounter Note creation (`consultation_packet_id`/`cited_fact_ids`) on `/encounters/[id]`, governed Tumor Board consensus (`staging_fact_id`/`cited_fact_ids`) on `/tumor-board`, and rejection of unanchored or prescriptive text (`checkTextForBoundary`). |
| **E2E-014** | `apps/web/e2e/wcag-accessibility.spec.ts` | `TASK-019` | Verifies WCAG 2.2 AA compliance across 10 routes (`0` axe-core violations, `>= 4.5:1` text contrast, `>= 3.0:1` UI border contrast, `0` unlabeled inputs, `<main id="main-content">`, skip link, and `aria-live="polite"` regions). |
| **E2E-015** | `apps/web/e2e/mobile-375px.spec.ts` | `TASK-020` | Verifies `document.documentElement.scrollWidth <= 375` at `375x812` mobile viewport across all 12 routes (`/workspace`, `/workspace?view=flow`, `/patients`, `/appointments`, `/tumor-board`, `/analytics`, `/patients/[id]/evidence`, `/record-map`, `/sources`, `/tasks`, `/packet`, `/continuity`). |
| **E2E-016** | `packages/adapters/test/provider-contracts.test.ts` | `TASK-014`, `TASK-026` | Verifies `GET /api/v1/system/providers` and runs HTTP contract tests for all 8 external provider adapters (`SarvamVisionOcrAdapter`, `SarvamSpeechAdapter`, `SarvamTranslationAdapter`, `BedrockLlmProvider`, `NvidiaNimExtractor`, `TextractOcrAdapter`, `SandboxAbdmAdapter`, `WebhookDeliveryAdapter`). |

---

## 3. Seven-Stage Live Judge Demonstration Script (End-to-End Walkthrough)

Once `TASK-001` through `TASK-026` are executed, the unified platform supports a seamless 7-stage live demonstration covering every Cancer Care track requirement:

1. **Stage 1 — Multi-Modal & Browser Extension Intake (`REQ-012`–`REQ-018`, `REQ-034`, `REQ-055`, `REQ-058`):**
   - Open `/patients/[DEMO-001]/sources`.
   - Show the **Segmented Multi-Report Packet** breakdown (`document_subpacket`) splitting an uploaded referral scan into Pathology, Lab, and Discharge sub-reports.
   - Mint a 10-minute `extension_grant` token and demonstrate **Manifest V3 EHR Browser Extension Capture** (`source_kind = 'extension_capture'`).
   - Switch to **Import from EHR / ABDM** (Tab 2) to ingest a Tata Memorial ABDM v6.5.0 bundle or trigger an M3 HIU Fidelius ECDH encrypted pull, and use **Link to Existing** (Tab 3) to link a near-duplicate scan.
2. **Stage 2 — Longitudinal Journey, Interval Deltas, Serial Lab Flowsheets & Batch Verify (`REQ-001`–`REQ-010`, `REQ-060`):**
   - Open `/patients/[DEMO-001]/evidence`.
   - Highlight the dynamic `PatientSnapshotHeader` alert banners and the **"Changes Since Last Visit"** delta banner (`Since Last Visit` filter).
   - Show the **Longitudinal Lab Flowsheet** displaying serial Hemoglobin values across different dates (`11.4 g/dL` → `10.2 g/dL`, delta `-1.2 g/dL`) with `0` false-positive conflicts.
   - Click **Review & Verify High-Confidence Batch** to verify all high-confidence non-conflicting spans in `<= 4 clicks`.
   - Open the **Reconciliation Room** (`/patients/[DEMO-001]/conflicts/[conflictId]`) to resolve a genuine same-date cross-document contradiction with Source A / Source B bounding boxes.
3. **Stage 3 — Oncology Checklists, Gap Waiver & Task Assignment (`REQ-008`, `REQ-022`, `REQ-054`):**
   - Open `/patients/[DEMO-001]/record-map` to switch between `ncg_oncology_intake`, `ncg_tumor_board_prep`, and `ncg_oncology_followup` templates and demonstrate an audited gap waiver (`waiveGapAction`).
   - Open `/patients/[DEMO-001]/tasks` to assign a pending IHC retrieval task in-row to `Anita Joseph (coordinator)`.
4. **Stage 4 — Readiness-Gated OPD Clinic Flow & Slot Backfill Agent (`REQ-019`–`REQ-021`, `REQ-039`, `REQ-056`):**
   - Open `/workspace?view=flow` (synchronized with `/appointments`).
   - Mark the `09:30` slot as `delayed_investigation` (`blocked`).
   - Open **Smart Slot Backfill**, showing `opdBackfillWorkflowGraph` ranking waitlisted patients whose packets are already `ready`.
   - Click **Offer Slot** (queuing a localized `patient_message`) and **Accept Slot Offer** to complete the two-step reassignment.
5. **Stage 5 — Guideline PDF Upload, Co-Pilot `[G#]` RAG & 4-Format Productivity Studio (`REQ-011`, `REQ-023`–`REQ-026`, `REQ-051`, `REQ-054`):**
   - On `/patients/[DEMO-001]/packet`, upload an institutional oncology SOP PDF via `GuidelineLibraryPanel`.
   - Open `Ask OncoBrief`, ask a protocol question, click the `[G1]` citation card to view the highlighted bounding box in the **Guideline Source Viewer**, and ask the Co-Pilot to propose a follow-up task (confirming the `pending_action_json` card).
   - In **Productivity Studio**, generate and preview all 4 deliverables: (1) Specialist Referral Letter, (2) Tumor Board Deck in **Slides View**, (3) De-Identified Academic Case Report (`Day 0`, `Day +N`), and (4) Patient & Caregiver Handout, then export as Print PDF, ABDM v6.5.0 FHIR, and HL7 mCODE STU4.
6. **Stage 6 — Governed Encounters & Multidisciplinary Tumor Board (`REQ-031`, `REQ-040`, `REQ-041`):**
   - Open `/encounters/[id]` and `/tumor-board` to show encounter notes and MDT consensus anchored to `consultation_packet_id` / `staging_fact_id` (`[E#]`) with code-level clinical boundary enforcement.
7. **Stage 7 — 11-Language Caregiver Voice Continuity & Mobile/Accessibility Verification (`REQ-027`–`REQ-030`, `REQ-045`, `REQ-046`, `REQ-057`, `REQ-059`):**
   - Open `/patients/[DEMO-001]/continuity`, preview localized appointment/document reminders across all 11 Indic languages, play the spoken voice note (`Sarvam Bulbul v3` / audible prosodic fallback), dispatch to patient + consented caregiver, and trigger an inbound attendance confirmation via `/api/v1/continuity/webhook`.
