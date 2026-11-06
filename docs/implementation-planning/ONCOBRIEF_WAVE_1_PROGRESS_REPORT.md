# OncoBrief — Wave 1 Implementation & Orchestration Progress Report

- **Report Date:** 2026-10-31
- **Active Branch:** `feat/v4-assessment-remediation`
- **Scope Covered:** Wave 0 Verification Audit (`TASK-001`, `TASK-002`) + Wave 1A (`TASK-003`, `TASK-004`, `TASK-005`, `TASK-007`, `TASK-010`, `TASK-012`) + Wave 1B (`TASK-009`) + Shared Integration (`seed.ts`, `patients.ts`, `actions.ts`)
- **Verification Discipline:** All tasks in Wave 0 and Wave 1 are classified strictly as **`IMPLEMENTED BUT UNVERIFIED`** inside the agent sandbox because the macOS seatbelt sandbox blocks spawning external host Node/pnpm binaries (`/opt/homebrew/bin/node` -> `exec: node: not found`) and loopback PostgreSQL sockets (`127.0.0.1:5432`). Exact Mac Terminal commands are provided below to transition every completed task to `IMPLEMENTED AND VERIFIED`.

---

## 1. Executive Status Matrix (Wave 0 + Wave 1A + Wave 1B)

| Task ID | Wave | Title | Implementation Status | Verification Status | Key Files Created / Modified |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **TASK-001** | Wave 0 | Unify Consultation Readiness Vocabulary (`ready \| gaps \| blocked \| none`) Across Domain & `/workspace` | **100% Implemented** | `IMPLEMENTED BUT UNVERIFIED` (Host CLI required) | `packages/domain/src/twin/readiness.ts`, `apps/web/src/app/(app)/workspace/page.tsx`, `packages/domain/test/twin.test.ts` |
| **TASK-002** | Wave 0 | Enforce Forced RLS on All 14 Milestone A/B Tables & Add DB Provenance Triggers (`0020_remediation_rls_and_governance.sql`) | **100% Implemented + Schema Refined in Step 1** | `IMPLEMENTED BUT UNVERIFIED` (Host PostgreSQL required) | `packages/db/migrations/0020_remediation_rls_and_governance.sql`, `packages/db/test/remediation-0020.test.ts` |
| **TASK-003** | Wave 1A | Middleware Authentication (`CVE-2025-29927`), Authorization & Tenant Safety | **100% Implemented** | `IMPLEMENTED BUT UNVERIFIED` (Host CLI required) | `apps/web/src/middleware.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/lib/middleware-security.test.ts` |
| **TASK-004** | Wave 1A | Evidence-Governed Encounter Notes & Tumor Board Workflows (`checkTextForBoundary` + Ledger Citations) | **100% Implemented** | `IMPLEMENTED BUT UNVERIFIED` (Host CLI required) | `packages/db/src/services/encounters.ts`, `packages/db/src/services/tumor-board.ts`, `apps/web/src/lib/encounter-actions.ts`, `apps/web/src/lib/tumor-board-actions.ts`, `apps/web/src/app/(app)/patients/[id]/encounters/[encounterId]/page.tsx`, `apps/web/src/app/(app)/tumor-board/page.tsx` |
| **TASK-005** | Wave 1A | Production Document-Ingestion `WorkflowStateGraph`, Dynamic OCR/Extraction Routing & Persisted Traces | **100% Implemented** | `IMPLEMENTED BUT UNVERIFIED` (Host CLI required) | `packages/domain/src/orchestration/workflow-graph.ts`, `packages/domain/src/index.ts`, `packages/db/src/services/documents.ts`, `packages/db/src/container.ts`, `packages/db/src/env.ts`, `apps/web/src/lib/actions.ts`, `packages/domain/test/workflow-graph.test.ts` |
| **TASK-007** | Wave 1A | Unified Appointment (`appointment`) & OPD Slot (`opd_appointment_slot`) Bidirectional Synchronization | **100% Implemented** | `IMPLEMENTED BUT UNVERIFIED` (Host CLI required) | `packages/db/src/services/appointments.ts`, `packages/db/src/services/opd-flow.ts`, `packages/db/src/seed.ts`, `packages/db/test/wave1-governance-and-sync.test.ts` |
| **TASK-010** | Wave 1A | Remove Synthetic Clinical Lab / `DEMO-001` Defaults from Real Patient Views | **100% Implemented** | `IMPLEMENTED BUT UNVERIFIED` (Host CLI required) | `apps/web/src/components/TimelineNodeView.tsx`, `apps/web/src/app/(app)/patients/[id]/evidence/page.tsx` |
| **TASK-012** | Wave 1A | Eleven-Language Continuity Templates, `SarvamTranslationAdapter`, and Audible Prosodic WAV TTS Fallback | **100% Implemented** | `IMPLEMENTED BUT UNVERIFIED` (Host CLI required) | `packages/adapters/src/sarvam-translation.ts`, `packages/adapters/src/sarvam-voice.ts`, `packages/adapters/src/index.ts`, `apps/web/src/lib/scoped-tts.ts`, `apps/web/src/components/ContinuityAudioPlayer.tsx`, `packages/db/src/seed.ts`, `packages/adapters/test/sarvam-translation-and-voice.test.ts` |
| **TASK-009** | Wave 1B | Upgrade `Ask OncoBrief` into a Bounded Multi-Step Administrative Co-Pilot (`createAssistantQueryWorkflowGraph`) | **100% Implemented** | `IMPLEMENTED BUT UNVERIFIED` (Host CLI required) | `apps/web/src/lib/assistant/classify.ts`, `apps/web/src/lib/assistant/orchestrator.ts`, `apps/web/src/app/api/v1/assistant/chat/route.ts`, `apps/web/src/app/api/v1/assistant/confirm-action/route.ts`, `apps/web/src/components/assistant/AssistantPanel.tsx`, `packages/db/src/services/patients.ts`, `apps/web/src/lib/assistant/orchestrator.test.ts` |

---

## 2. Step 1 Findings: Wave 0 Audit & Critical Schema Refinement

1. **Host Environment Probe:**
   - `/opt/homebrew/bin/psql` is visible on disk, but `node` and `pnpm` reside outside the sandbox's allowed execution paths (`./node_modules/.bin/tsc: line 16: exec: node: not found`), and loopback TCP connections to PostgreSQL (`127.0.0.1:5432`) are blocked by the macOS sandbox seatbelt.
   - Per non-negotiable engineering rules, no Python simulation was substituted for TypeScript or PostgreSQL test execution.
2. **Critical Schema Compatibility Fix in `0020_remediation_rls_and_governance.sql` (`TASK-002`):**
   - During Step 1's static review of `0020_remediation_rls_and_governance.sql` against `packages/domain/src/vocab/fact-types.ts`, we discovered that `validate_tumor_board_case_governance()` previously checked:
     ```sql
     AND ef.fact_type IN ('stage.recorded', 'diagnosis.recorded', 'pathology.histology')
     ```
     whereas the canonical `FACT_TYPES` in `@oncobrief/domain` (and seeded in `seed.ts`) are `'stage_text.as_written'`, `'diagnosis_text.as_written'`, and `'procedure.recorded'`.
   - **Fix Applied:** Updated `validate_tumor_board_case_governance()` in `0020_remediation_rls_and_governance.sql` and `packages/db/test/remediation-0020.test.ts` to accept both the canonical domain fact types (`'stage_text.as_written'`, `'diagnosis_text.as_written'`, `'procedure.recorded'`) and legacy test aliases (`'stage.recorded'`, `'diagnosis.recorded'`, `'pathology.histology'`).
   - Also expanded `encounter_note_version_note_governance_kind_check` to permit both `'human_operational_coordination'` and `'ledger_anchored'`, and expanded `chat_message_provider_mode_check` to permit `'deterministic'`, `'nvidia-llm'`, `'bedrock-llm'`, `'hybrid'`, `'live_bedrock'`, and `'deterministic_grounded'`.

---

## 3. Step 2 Findings: Corrected Parallel Execution Plan & File Ownership

Before executing Wave 1, we audited the exact repository file paths and corrected the following discrepancies between the planning assumptions and the actual codebase:

1. **Actual Repository File Paths Resolved:**
   - The OPD database service is `packages/db/src/services/opd-flow.ts` (not `opd.ts`).
   - The Continuity message service is `packages/db/src/services/messages.ts` (not `continuity.ts`), and chat persistence (`createConversation`, `addMessage`, `getConversation`) lives in `packages/db/src/services/patients.ts`.
   - The Sarvam speech adapter is `packages/adapters/src/sarvam-voice.ts` (not `sarvam-speech.ts`), and the Assistant UI drawer is `apps/web/src/components/assistant/AssistantPanel.tsx` (not `AssistantDrawer.tsx`).
   - The Encounter detail route is `apps/web/src/app/(app)/patients/[id]/encounters/[encounterId]/page.tsx`.
2. **Conflict-Free File Ownership Sequencing:**
   - **`packages/domain/src/orchestration/workflow-graph.ts`:** Created once in Wave 1A (`TASK-005`) defining both `createDocumentIngestionWorkflowGraph` and `createAssistantQueryWorkflowGraph`, then consumed without merge conflict by `TASK-009` in Wave 1B.
   - **`packages/db/src/seed.ts`:** Updated once in Step 5 by a single integration owner combining `TASK-012` (11-locale templates), `TASK-007` (synchronized `appointment` + `opd_appointment_slot` rows with `appointment_id`), and `TASK-004` compatibility.

---

## 4. Detailed Implementation Summary (Wave 1A & Wave 1B)

### 4.1 `TASK-003` — Middleware Authentication (`CVE-2025-29927`), Authorization & Tenant Safety
- Created [apps/web/src/middleware.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/middleware.ts):
  - Rejects any request containing the `x-middleware-subrequest` header (case-insensitive) with HTTP `403 Forbidden` (`forbidden_middleware_header_spoof`), neutralizing `CVE-2025-29927`.
  - Requires either a valid-format `ob_session` cookie or `Authorization: Bearer <token>` header on all non-public routes, returning `401` JSON on `/api/*` and `307` redirect to `/login?next=...` on UI routes.
  - Attaches `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: same-origin` to every response.
- Updated [apps/web/src/lib/session.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/lib/session.ts) with `assertRolePermission(role, permission)` and `assertPatientBelongsToOrg(q, orgId, patientId)`.
- Added unit test suite [apps/web/src/lib/middleware-security.test.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/lib/middleware-security.test.ts).

### 4.2 `TASK-004` — Evidence-Governed Encounter Notes & Tumor Board Workflows
- Updated [packages/db/src/services/encounters.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/services/encounters.ts) and [packages/db/src/services/tumor-board.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/services/tumor-board.ts):
  - Enforces `scanForBoundaryViolation()` across all free-text note and tumor-board fields (`chief_complaint`, `history_present_illness`, `clinical_assessment`, `plan_and_instructions`, `follow_up_instructions`, `discussion_summary`, `recommendation_notes`, `clinical_staging`).
  - Persists `consultation_packet_id`, `cited_fact_ids`, and `note_governance_kind` on `encounter_note_version`, and `staging_fact_id` + `cited_fact_ids` on `tumor_board_case` (resolving verbatim text from verified staging facts via `resolveVerifiedStagingFactText`).
- Updated [apps/web/src/lib/encounter-actions.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/lib/encounter-actions.ts) and [apps/web/src/lib/tumor-board-actions.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/lib/tumor-board-actions.ts) with `assertPatientBelongsToOrg` guards, citation list parsing, and fixed the checkbox field-name mismatch (`checklist_histology` / `checklistHistology`) in `tumor-board-actions.ts`.
- Updated [encounters/[encounterId]/page.tsx](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/app/(app)/patients/[id]/encounters/[encounterId]/page.tsx) and [tumor-board/page.tsx](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/app/(app)/tumor-board/page.tsx) to surface Evidence Ledger provenance citations in the UI.

### 4.3 `TASK-005` — Production Document-Ingestion `WorkflowStateGraph` & Dynamic Routing
- Created [packages/domain/src/orchestration/workflow-graph.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/domain/src/orchestration/workflow-graph.ts) and exported it from [packages/domain/src/index.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/domain/src/index.ts).
- Wired `createDocumentIngestionWorkflowGraph` (`triage_node` → `segment_packet_node` → `persist_spans_node` → `classify_node` → `extract_candidates_node` → `two_stage_span_gate_node` → `conflict_and_delta_node` → `human_review_interrupt_gate`) into `ingestNormalizedPages` in [packages/db/src/services/documents.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/services/documents.ts), recording `visited_nodes`, `execution_trace`, `subpackets`, `ocr_engine`, `extractor_kind`, and `provider_mode` on `document.ingested` audit events.
- Updated [packages/db/src/container.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/container.ts), [packages/db/src/env.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/env.ts), and [apps/web/src/lib/actions.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/lib/actions.ts) so `getExtractor()` routes dynamically to `LlmExtractionAdapter(BedrockLlmProvider)` (with automatic fallback to `RuleBasedExtractor`) when `EXTRACTOR_DRIVER=bedrock` or AWS Bedrock credentials are configured.

### 4.4 `TASK-007` — Unified Appointment & OPD Slot Synchronization
- Updated [packages/db/src/services/appointments.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/services/appointments.ts) so `createAppointment` and `changeAppointmentStatus` automatically create/update the corresponding `opd_appointment_slot` row linked via `appointment_id`.
- Updated [packages/db/src/services/opd-flow.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/services/opd-flow.ts) so `updateOpdSlotStatus` synchronizes status transitions back to the linked `appointment` row and appends an `appointment_status_history` entry.
- Updated [packages/db/src/seed.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/seed.ts) so seeded `opd_appointment_slot` rows for `DEMO-001`, `DEMO-002`, and `DEMO-003` are linked to corresponding `appointment` rows via `appointment_id`.

### 4.5 `TASK-010` — Remove Synthetic Clinical Lab / `DEMO-001` Defaults from Real Patient Views
- Verified that `getPatientClinicalSummary` ([packages/db/src/services/patients.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/services/patients.ts)) queries only real `evidence_fact` rows for the current `patientId`.
- Removed the hardcoded `'DEMO-001'`, `openTasksCount = 3`, and `documentsCount = 8` defaults in [TimelineNodeView.tsx](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/components/TimelineNodeView.tsx) and the `'DEMO-001'` fallback in [evidence/page.tsx](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/app/(app)/patients/[id]/evidence/page.tsx).

### 4.6 `TASK-012` — Eleven-Language Templates, `SarvamTranslationAdapter` & Audible WAV TTS Fallback
- Created [packages/adapters/src/sarvam-translation.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/adapters/src/sarvam-translation.ts) providing `SarvamTranslationAdapter` (`POST https://api.sarvam.ai/translate`, `model: 'mayura:v1'`) and `ELEVEN_LOCALE_TEMPLATES` across all 11 supported languages (`en`, `hi`, `ta`, `te`, `bn`, `mr`, `kn`, `ml`, `gu`, `pa`, `or`).
- Added `generateAudibleFallbackWav()` in [packages/adapters/src/sarvam-voice.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/adapters/src/sarvam-voice.ts) and wired it into [apps/web/src/lib/scoped-tts.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/lib/scoped-tts.ts) and [apps/web/src/components/ContinuityAudioPlayer.tsx](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/components/ContinuityAudioPlayer.tsx) so offline fallback produces a real 16-bit PCM WAV prosodic triad (`maxAmplitude > 12000`) + Web Speech synthesis rather than zero-amplitude silence, while preserving the HTTP `503` + `fallbackText` contract tested in `tts-scope.test.ts`.
- Updated [packages/db/src/seed.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/seed.ts) to seed native-script `appointment_reminder` and `opd_slot_offer_v1` templates across all 11 languages.

### 4.7 `TASK-009` (Wave 1B) — Bounded Multi-Step Administrative Co-Pilot
- Updated [apps/web/src/lib/assistant/classify.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/lib/assistant/classify.ts) with `detectSubIntents(message, primaryIntent)` to identify multi-tool sub-goals (`evidence_question`, `missing_documents_question`, `continuity_question`, `guideline_knowledge_question`, `propose_task_action`) within a single question.
- Upgraded [apps/web/src/lib/assistant/orchestrator.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/lib/assistant/orchestrator.ts) to execute `createAssistantQueryWorkflowGraph` (`safety_and_intent_gate` → `plan_subgoals_node` → `retrieve_sources_node` → `propose_action_gate` → `grounded_synthesis_node` → `citation_verification_gate`), staging `pendingAction` (`status: 'awaiting_human_approval'`) with zero unauthorized DB writes during chat and returning `executionTrace`, `visitedNodes`, and `providerMode`.
- Updated [packages/db/src/services/patients.ts](file:///Users/dhaanish/Documents/OncoBrief/packages/db/src/services/patients.ts) and [apps/web/src/app/api/v1/assistant/chat/route.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/app/api/v1/assistant/chat/route.ts) to persist `execution_trace_json`, `pending_action_json`, and `provider_mode` on `chat_message`.
- Created [apps/web/src/app/api/v1/assistant/confirm-action/route.ts](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/app/api/v1/assistant/confirm-action/route.ts) and updated [apps/web/src/components/assistant/AssistantPanel.tsx](file:///Users/dhaanish/Documents/OncoBrief/apps/web/src/components/assistant/AssistantPanel.tsx) to display the collapsible **State-Graph Trace** (`data-testid="assistant-execution-trace"`) and interactive **Approve & Create Task / Dismiss** card (`data-testid="assistant-pending-action-card"`).

---

## 5. Mac Terminal Verification Commands (To Close Host Sandbox Verification Gate)

Run the following commands in your Mac Terminal from `/Users/dhaanish/Documents/OncoBrief` to execute the full Wave 0 + Wave 1 verification suite against your local Node.js and PostgreSQL instance:

```bash
cd /Users/dhaanish/Documents/OncoBrief

# 1. Static Type, Clinical Boundary & Branding Verification
pnpm -r typecheck
pnpm boundary:check
pnpm branding:check

# 2. Domain & Adapter Unit Tests (TASK-001, TASK-005, TASK-009, TASK-012)
pnpm --filter @oncobrief/domain test
pnpm --filter @oncobrief/adapters test

# 3. Web Unit Tests (TASK-003 Middleware, TASK-009 Co-Pilot, TASK-012 TTS Scope)
pnpm --filter @oncobrief/web test

# 4. Database Migrations, Seeding & RLS / Governance Integration Tests (TASK-002, TASK-004, TASK-005, TASK-007)
pnpm db:migrate
pnpm db:seed
pnpm --filter @oncobrief/db test -- remediation-0020.test.ts
pnpm --filter @oncobrief/db test -- wave1-governance-and-sync.test.ts
```

---

## 6. Readiness for Wave 2

All Wave 1A and Wave 1B dependencies required by **Wave 2 (`TASK-006`, `TASK-008`, `TASK-011`, `TASK-013`, `TASK-016`, `TASK-017`, `TASK-018`, `TASK-022`, `TASK-023`)** are now implemented in the working tree on branch `feat/v4-assessment-remediation`.
