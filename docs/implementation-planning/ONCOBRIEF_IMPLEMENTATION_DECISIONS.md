# OncoBrief — Architecture Decision Records (ADRs) for 100% V4 Implementation & Remediation

- **Document Version:** 2.0 (Unified 100% Scope Edition — Zero In-Scope Deferrals)
- **Target Repository:** `/Users/dhaanish/Documents/OncoBrief`
- **Active Branch:** `feat/v4-assessment-remediation`
- **Governing Policy:** All architectural decisions enforce a **single unified 100% implementation scope** (`REQ-001` through `REQ-065`, `TASK-001` through `TASK-026`). No non-clinical feature from `ONCOBRIEF_ENHANCEMENT_PLAN.md` or Milestones A/B is deferred or classified as a non-goal.

---

## ADR-001: Canonical Consultation Readiness State Vocabulary (`ready | gaps | blocked | none`)

- **Status:** `ACCEPTED & IMPLEMENTED ON BRANCH` (`TASK-001`)
- **Context:**
  - `packages/domain/src/twin/readiness.ts` and `packages/db/migrations/0002_schema.sql` define `readiness_band` as `'ready' | 'gaps' | 'blocked'` (plus `'none'` in `patient_twin_summary` when a patient has not yet been evaluated).
  - `apps/web/src/app/(app)/workspace/page.tsx` previously compared `p.readinessBand === 'complete'` and rendered a `?band=complete` filter pill, causing the Consult-Ready counter to permanently display `0` and the Ready filter to return an empty list.
- **Decision:**
  - Standardize on `WORKLIST_BAND_FILTER_VALUES = ['all', 'ready', 'gaps', 'blocked', 'none'] as const` in `packages/domain/src/twin/readiness.ts`.
  - Provide pure domain helpers `computeWorklistReadinessSummary(patients)` and `filterWorklistPatients(patients, bandFilter)` so `/workspace` and `/analytics` share identical readiness math.
- **Consequences:**
  - Implemented in `packages/domain/src/twin/readiness.ts`, `apps/web/src/app/(app)/workspace/page.tsx`, and `packages/domain/test/twin.test.ts` on branch `feat/v4-assessment-remediation`.

---

## ADR-002: Universal Forced Row-Level Security (`ENABLE + FORCE RLS`) & Database-Level Provenance Triggers (`0020_remediation_rls_and_governance.sql`)

- **Status:** `ACCEPTED & IMPLEMENTED ON BRANCH` (`TASK-002`)
- **Context:**
  - Migrations `0016_hospital_org_foundation.sql` (5 tables: `facility`, `department`, `clinician_profile`, `user_invitation`, `patient_care_team`) and `0019_clinical_workflows_foundation.sql` (9 tables: `clinic_session`, `clinician_unavailability`, `appointment`, `appointment_status_history`, `encounter`, `encounter_participant`, `encounter_note_version`, `tumor_board_meeting`, `tumor_board_case`) created **14 tenant-scoped tables** with `GRANT ... TO oncobrief_app` but **zero** `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, or `CREATE POLICY tenant_isolation` statements.
  - Furthermore, `encounter_note_version` and `tumor_board_case` allowed unanchored free-text clinical notes and staging strings without ledger provenance.
- **Decision:**
  - Apply `packages/db/migrations/0020_remediation_rls_and_governance.sql` to:
    1. Enforce `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with null-safe `USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)` policies across all 14 Milestone A/B tables.
    2. Add composite `(org_id, patient_id, id)` uniqueness on `evidence_fact` and `consultation_packet` and enforce `validate_tumor_board_case_governance()` and `validate_encounter_note_governance()` triggers at the PostgreSQL layer.
    3. Extend `chat_message` (`0006_chat_history.sql`) with `execution_trace_json`, `pending_action_json`, and `provider_mode`.
- **Consequences:**
  - Implemented in `packages/db/migrations/0020_remediation_rls_and_governance.sql` and tested in `packages/db/test/remediation-0020.test.ts`.

---

## ADR-003: Defense-in-Depth Authentication, Middleware Header Sanitization (`CVE-2025-29927`), and Server Action RBAC (`TASK-003`)

- **Status:** `ACCEPTED` (`TASK-003`)
- **Context:**
  - Next.js middleware must never trust client-supplied `x-middleware-subrequest` headers (`CVE-2025-29927`), and every mutating Server Action (`apps/web/src/lib/actions.ts`) and Route Handler (`/api/v1/**`) must independently verify `requireSession()`, role permission (`can(session.role, permission)`), and tenant/patient ownership inside `withSession()`.
- **Decision:**
  - Strip or reject any inbound request carrying `x-middleware-subrequest` in `apps/web/src/middleware.ts`, protect all non-public routes (`/workspace`, `/patients`, `/appointments`, `/encounters`, `/tumor-board`, `/analytics`, `/settings`, `/onboarding`, `/api/v1/**` except `/api/v1/health`, `/api/v1/extension/capture` which uses Bearer grant auth, and `/api/v1/abdm/**` / `/api/v1/continuity/webhook` which use HMAC/gateway signature auth), and enforce `assertCan(session.role, permission)` + patient-org ownership in every Server Action.

---

## ADR-004: Non-Clinical Governance of Encounter Notes & Tumor Board Consensus (`TASK-004`)

- **Status:** `ACCEPTED` (`TASK-004`)
- **Context:**
  - Milestone B introduced `encounter_note_version` and `tumor_board_case` (`tnm_staging`, `consensus_summary`, `treatment_plan`, `clinical_trial_matches`) without running `checkTextForBoundary()` or anchoring to `evidence_fact` / `consultation_packet`.
- **Decision:**
  - Enforce `checkTextForBoundary()` in `packages/db/src/services/encounters.ts` and `packages/db/src/services/tumor-board.ts` before any `INSERT` or `UPDATE`.
  - Require `tumor_board_case.tnm_staging` to reference a valid same-patient `staging_fact_id` (`fact_type = 'stage_text.as_written'`) whose value matches verbatim, and require `consensus_summary` / `treatment_plan` to record administrative coordination decisions anchored to `cited_fact_ids` (`cardinality >= 1`).
  - Require `encounter_note_version` (`note_governance_kind = 'ledger_anchored'`) to reference either an approved `consultation_packet_id` or `cited_fact_ids` (`cardinality >= 1`).

---

## ADR-005: Production Wiring of `WorkflowStateGraph` Across All Four Bounded Agentic Workflows (`TASK-005`, `TASK-008`, `TASK-009`, `TASK-023`)

- **Status:** `ACCEPTED` (`TASK-005`, `TASK-008`, `TASK-009`, `TASK-023`)
- **Context:**
  - `packages/domain/src/orchestration/workflow-graph.ts` implements `WorkflowStateGraph<TState>` (`documentIngestionWorkflowGraph`, `assistantQueryWorkflowGraph`, `opdBackfillWorkflowGraph`), yet production ingestion (`ingestDocument`), assistant chat (`runAssistantTurn`), OPD backfill (`offerOpdSlot`), and continuity outreach bypassed the state graph.
- **Decision:**
  - Wire `WorkflowStateGraph<TState>` directly into all four production execution paths:
    1. **Document Intelligence Graph (`documentIngestionWorkflowGraph` in `TASK-005` & `TASK-017`):** `triageNode` → `segmentPacketNode` (`segmentDocumentPacket`) → `ocrRouteNode` (`Sarvam` / `Textract` / `LocalMultimodal`) → `extractCandidatesNode` (`Bedrock` / `NvidiaNim` / `RuleBased`) → `twoStageSpanGateNode` → `dateScopedConflictAndDeltaNode` → `humanReviewInterruptGate`.
    2. **Ask OncoBrief Co-Pilot Graph (`assistantQueryWorkflowGraph` in `TASK-009`):** `intentClassifierNode` → conditional branch (`patientEvidenceRetrieverNode` `[E#]`, `institutionalGuidelineRetrieverNode` `[G#]`, `opdFlowStatusNode`, `actionProposalNode` for task/draft staging, or `boundaryRefusalNode`) → `groundedSynthesisNode` → `citationVerificationGateNode`.
    3. **OPD Coordination Agent Graph (`opdBackfillWorkflowGraph` in `TASK-008`):** `detectVacantOrBlockedSlotNode` → `queryWaitlistAndReadinessNode` → `rankReadyCandidatesNode` → `stageSlotOfferAndNotificationNode` → `coordinatorApprovalGate`.
    4. **Continuity Attendance Agent Graph (`continuityOutreachWorkflowGraph` in `TASK-023`):** `selectApprovedTemplateNode` → `translateAndRender11LocaleNode` → `synthesizeBulbulAudioNode` → `clinicianOutreachApprovalGate` → `processInboundPatientReplyNode`.
  - Persist every graph execution's `GraphExecutionResult.visitedNodes` and `checkpoints` in `audit_event.metadata_json` and `chat_message.execution_trace_json`.

---

## ADR-006: Unified OPD Scheduling & Two-Step Slot Offer Acceptance (`TASK-007`, `TASK-008`)

- **Status:** `ACCEPTED` (`TASK-007`, `TASK-008`)
- **Context:**
  - Milestone B created `appointment` (`0019`) while V4 created `opd_appointment_slot` (`0011`), resulting in two unsynchronized scheduling tables. In addition, `offerOpdSlot` immediately overwrote `opd_appointment_slot.patient_id` without dispatching a patient notification or waiting for patient acceptance.
- **Decision:**
  - Link `opd_appointment_slot.appointment_id` (`0020` migration) to `appointment.id` and synchronize status transitions bidirectionally (`scheduled` ↔ `confirmed`, `checked_in` ↔ `checked_in`, `in_consult` ↔ `in_progress`, `completed` ↔ `completed`, `cancelled` ↔ `cancelled`, `no_show` ↔ `no_show`).
  - Refactor `offerOpdSlot` into a two-step operational lifecycle:
    1. **Step 1 (`offerOpdSlot`):** Sets `opd_waitlist_entry.status = 'offered'`, `offered_slot_id = slotId`, records `offered_at` and `offer_expires_at` (`now() + 30 minutes`), and creates a localized `patient_message` (`template_code = 'opd_slot_offer_v1'`) in the Continuity outbox.
    2. **Step 2 (`acceptOpdSlotOffer` / `releaseOpdSlotOffer`):** When the patient confirms (via inbound webhook or coordinator click), assigns `opd_appointment_slot.patient_id`, sets `opd_waitlist_entry.status = 'slotted'`, and syncs the linked `appointment`. If declined or expired, releases the offer so the next `ready` waitlist candidate can be offered the slot.

---

## ADR-007: Manifest V3 EHR Browser Extension (`apps/extension`) & Short-Lived `extension_grant` Capture API (`TASK-016`)

- **Status:** `ACCEPTED — ZERO DEFERRAL` (`TASK-016`, Supersedes prior non-goal classification for `REQ-034`)
- **Context:**
  - `ONCOBRIEF_ENHANCEMENT_PLAN.md` Story 4.3 & §5 specify a **Manifest V3 EHR Browser Extension (`apps/extension`)** that launches from a hospital EHR page and captures records using short-lived `extension_grant` tokens defined in `packages/db/migrations/0002_schema.sql:405-419`.
  - The database table `extension_grant` (`id`, `org_id`, `user_id`, `patient_id`, `scope text[]`, `token_hash bytea UNIQUE`, `created_at`, `expires_at`, `used_at`, `revoked_at`, `origin text`, `CHECK (expires_at <= created_at + INTERVAL '10 minutes')`) and RLS policy (`0003_rls.sql:43`) already exist in PostgreSQL, along with `source_kind = 'extension_capture'` on `document`!
- **Decision:**
  - Build the complete Manifest V3 Browser Extension in `apps/extension/` (`manifest.json`, `popup.html`, `popup.js`, `content-script.js`, `background.js`) and two backend endpoints:
    1. `POST /api/v1/patients/[id]/extension-grants`: Authenticated clinician/coordinator/records_officer endpoint that generates a 32-byte cryptographically random bearer token (`ob_ext_<base64url>`), stores only `sha256(token)` in `extension_grant.token_hash` with `expires_at = now() + interval '10 minutes'` and `scope = ['document:capture', 'readiness:read']`, and returns the one-time token + launch URI.
    2. `POST /api/v1/extension/capture`: Validates the Bearer token by hashing it and performing an atomic `UPDATE extension_grant SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING org_id, user_id, patient_id, scope`, then ingests the captured EHR page text/PDF/FHIR payload via `createDocument(..., { sourceKind: 'extension_capture' })` + `ingestDocument()`.

---

## ADR-008: Multi-Report Scan Packet Segmentation (`segmentDocumentPacket`) Persistence & UI (`TASK-017`)

- **Status:** `ACCEPTED` (`TASK-017`)
- **Context:**
  - Indian oncology patients routinely arrive with a single multi-page scanned PDF containing several distinct documents (e.g., Page 1 Histopathology Report from Tata Memorial, Page 2 CBC Lab Report from SRL Diagnostics, Page 3 Discharge Summary).
  - `packages/domain/src/ingestion/packet-segmenter.ts` already implements `segmentDocumentPacket(pages)` (per Damani et al., 2026 & `ONCOBRIEF_ENHANCEMENT_PLAN.md` §5 Node 2), returning `PacketSubDocument[]` (`index`, `startPage`, `endPage`, `category`, `statedDate`, `statedFacility`, `confidence`), but `ingestNormalizedPages()` in `packages/db/src/services/documents.ts` never calls it or persists the segments.
- **Decision:**
  - Create migration `packages/db/migrations/0021_complete_v4_scope.sql` adding table `document_subpacket` (`id`, `org_id`, `patient_id`, `document_id`, `subpacket_index`, `start_page`, `end_page`, `category`, `stated_date`, `stated_facility`, `confidence`, `created_at`) with `ENABLE + FORCE RLS`.
  - Wire `segmentDocumentPacket()` as Node 2 (`segmentPacketNode`) of `documentIngestionWorkflowGraph` inside `ingestNormalizedPages()`, persisting all detected sub-documents to `document_subpacket` and rendering a **Segmented Sub-Documents (`N` Reports in Packet)** breakdown on `/patients/[id]/sources` and `/patients/[id]/sources/[docId]`.

---

## ADR-009: Interactive Guideline PDF Upload, OCR Span Extraction & Dedicated `[G#]` Source Viewer (`TASK-018`)

- **Status:** `ACCEPTED` (`TASK-018`)
- **Context:**
  - `ONCOBRIEF_ENHANCEMENT_PLAN.md` Story 3.1 & KR3.1 require span-grounded retrieval over **uploaded institutional SOPs and NCG oncology guideline PDFs** where clicking a `[G1]` citation opens the exact guideline page and highlights the verbatim bounding box.
  - Previously, `guideline_document` and `guideline_span` could only be populated by `seed.ts`, and clicking `[G1]` navigated to `/patients/[id]/sources?guideline=<id>&page=<n>`, which `sources/page.tsx` ignored.
- **Decision:**
  - Implement `ingestGuidelineDocumentPdf(q, deps, input)` in `packages/db/src/services/studio.ts` (and `uploadGuidelinePdfAction` in `apps/web/src/lib/actions.ts`), which runs the uploaded PDF through `OcrPort` (`SarvamVisionOcrAdapter` / `TextractOcrAdapter` / `LocalMultimodalOcrAdapter`), extracts section headings, paragraph spans, normalized bounding boxes (`bbox_x`, `bbox_y`, `bbox_w`, `bbox_h`), and oncology keywords into `guideline_document` + `guideline_span`, and records a `guideline.uploaded` audit event.
  - Enhance `/patients/[id]/sources/page.tsx` so when `?guideline=<guidelineDocumentId>&page=<pageNumber>&span=<spanId>` is present in `searchParams`, it renders the **Institutional Guideline & SOP Source Pane** highlighting the exact `guideline_span` bounding box and verbatim text with the mandatory banner: `Reference Guideline Extract — For Clinician Review Only (Not a Patient-Specific Order)`.

---

## ADR-010: Dual-Mode External Provider Architecture & Explicit Verification Tiers (`TASK-012`, `TASK-014`, `TASK-024`, `TASK-025`, `TASK-026`)

- **Status:** `ACCEPTED` (`TASK-012`, `TASK-014`, `TASK-024`, `TASK-025`, `TASK-026`)
- **Context:**
  - To satisfy both real-world hospital integration readiness and 100% offline/sandbox reliability during judging, every external integration port (`OcrPort`, `ExtractionPort`, `SttPort`, `TtsPort`, `TranslationPort`, `DeliveryPort`, `AbdmGatewayPort`) must have both a complete, contract-tested production HTTP/SDK adapter and an honest, functional local deterministic adapter.
- **Decision:**
  1. **Translation (`TranslationPort`):** Implement `SarvamTranslationAdapter` (`packages/adapters/src/sarvam-translation.ts`, calling `POST https://api.sarvam.ai/translate` with `model: 'mayura:v1'`) alongside `DeterministicTemplateTranslationAdapter` supporting all 11 Indic languages (`en-IN`, `hi-IN`, `ta-IN`, `te-IN`, `bn-IN`, `mr-IN`, `kn-IN`, `ml-IN`, `gu-IN`, `pa-IN`, `or-IN`).
  2. **TTS Audio (`TtsPort`):** Use `SarvamSpeechAdapter.synthesizeSpeech` (`bulbul:v3`) when `SARVAM_API_KEY` is configured, and replace the silent WAV buffer fallback with `generateAudibleFallbackWav()` (synthesizing a clean, audible 440Hz/554Hz/659Hz prosodic chime + spoken Web Speech synthesis in `ContinuityAudioPlayer.tsx`).
  3. **Outbound Delivery (`DeliveryPort`):** Implement `WebhookDeliveryAdapter` (`packages/adapters/src/webhook-delivery.ts`) supporting Twilio REST (`Messages.json` for SMS/WhatsApp) and HMAC-signed HTTP webhooks alongside `SimulatedDeliveryAdapter`.
  4. **Provider Health & Transparency (`/api/v1/system/providers`):** Expose a structured provider status endpoint reporting `Code Complete`, `Sandbox Verified`, or `Live Verified` for every adapter and render `ProviderModeBadge` across all UI surfaces.

---

## ADR-011: WCAG 2.2 AA Zero-Violation Accessibility & 375px Mobile Viewport Gate (`TASK-019`, `TASK-020`)

- **Status:** `ACCEPTED` (`TASK-019`, `TASK-020`)
- **Context:**
  - `ONCOBRIEF_ENHANCEMENT_PLAN.md` KR4.2 and Task 5.2 require `>= 4.5:1` text contrast, `>= 3.0:1` UI border contrast, `0` unlabeled form inputs, semantic `<main id="main-content">` landmarks, `aria-live="polite"` status announcements, and `0px` horizontal overflow (`scrollWidth <= 375`) at `375px` mobile width across all pages.
- **Decision:**
  - Enforce WCAG 2.2 AA contrast tokens in `apps/web/src/app/globals.css` (`--color-state-extracted: #7c530b`, `--color-rule-strong: #857d6f`) and replace any low-contrast Tailwind utilities (`text-slate-400` on light backgrounds) with `text-slate-600` / `var(--color-ink-soft)`.
  - Audit and label every `<input>`, `<select>`, and `<textarea>` across all V4 and Milestone A/B pages (`/workspace`, `/patients`, `/appointments`, `/encounters/[id]`, `/tumor-board`, `/analytics`, `/patients/[id]/**`).
  - Wrap wide clinical tables (`ClinicalContextView`, `OpdFlowBoard`, `appointments`, `tumor-board`) in `overflow-x-auto max-w-full` containers with `min-w-0` parent flex/grid items so `document.documentElement.scrollWidth <= 375` holds across all 12 routes in Playwright (`apps/web/e2e/mobile-375px.spec.ts` and `apps/web/e2e/wcag-accessibility.spec.ts`).
