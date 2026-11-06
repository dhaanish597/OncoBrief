# OncoBrief — Agentic AI & Deterministic State-Graph Orchestration Implementation Plan

- **Document Version:** 2.0 (Unified 100% Scope Edition — All 4 Production State-Graph Agents)
- **Target Repository:** `/Users/dhaanish/Documents/OncoBrief`
- **Core Orchestration Module:** `packages/domain/src/orchestration/workflow-graph.ts`
- **Associated Tasks:** `TASK-005`, `TASK-008`, `TASK-009`, `TASK-017`, `TASK-018`, `TASK-023`, `TASK-026`

---

## 1. Architectural Philosophy: Bounded, Deterministic State-Graph Agents with Mandatory Human Gates

To satisfy Health-a-thon 2026's **Technology Approach** principle (*"Leverage existing AI capabilities, including AI agents, orchestration frameworks..."*) while strictly enforcing the **Safety & Non-Clinical Boundary** (*"No autonomous clinical advice; human override on every step"*), OncoBrief implements four specialized, bounded state-graph agents built on `WorkflowStateGraph<TState>` (`packages/domain/src/orchestration/workflow-graph.ts`):

1. **Agent 1 — Multi-Modal Document Intelligence & Segmentation Graph (`documentIngestionWorkflowGraph`):** Orchestrates SHA-256 triage, multi-report packet segmentation (`segmentDocumentPacket`), dynamic OCR routing (`Sarvam Vision` / `AWS Textract` / `Local Multimodal + Tesseract`), structured oncology candidate extraction (`Amazon Bedrock Nova Pro` / `NVIDIA NIM` / `RuleBasedExtractor`), Two-Stage Span & Entailment validation, and date-scoped longitudinal conflict/delta computation.
2. **Agent 2 — Grounded Clinical-Admin & Guideline Co-Pilot Graph (`assistantQueryWorkflowGraph`):** Orchestrates intent classification, parallel retrieval of patient ledger spans (`[E#]`), institutional/NCG oncology guideline spans (`[G#]`), and live OPD queue status, stages confirmation-gated administrative actions (`propose_create_task`, `propose_assign_task`, `propose_studio_draft`), enforces clinical boundary refusals, and runs a post-generation citation verification gate.
3. **Agent 3 — Readiness-Gated OPD Flow & Slot Backfill Coordinator Graph (`opdBackfillWorkflowGraph`):** Monitors cancelled or `delayed_investigation` (`blocked`) OPD clinic slots, cross-references waitlisted patients against live `patient_twin_summary.readiness_band === 'ready'` and source-anchored administrative priority tags, ranks eligible backfill candidates, and stages a human-approved slot offer + localized `patient_message`.
4. **Agent 4 — Multilingual Care Continuity & Attendance Confirmation Graph (`continuityOutreachWorkflowGraph`):** Orchestrates verified fact selection (`appointment.scheduled`, `instruction.recorded`), 11-language Indic translation/rendering (`Sarvam Mayura` / native-script templates), `Sarvam Bulbul v3` spoken voice-note synthesis, clinician approval gating, outbound delivery (`WebhookDeliveryAdapter` / `SimulatedDeliveryAdapter`), and inbound two-way patient/caregiver reply processing (`confirm_attendance`, `request_reschedule`, `confirm_documents_ready`).

---

## 2. Agent 1: Multi-Modal Document Intelligence & Segmentation Graph (`TASK-005`, `TASK-006`, `TASK-017`)

### 2.1 State Contract (`DocumentIngestionGraphState`)
- **File:** `packages/domain/src/orchestration/workflow-graph.ts`
```ts
export interface DocumentIngestionGraphState {
  orgId: string;
  patientId: string;
  documentId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  ocrDriver: 'sarvam' | 'textract' | 'local';
  extractorDriver: 'bedrock' | 'nvidia' | 'rule';
  providerMode: 'live' | 'sandbox' | 'fallback';
  pageCount: number;
  subPackets: PacketSubDocument[];
  documentType: DocumentType | null;
  typeConfidence: 'high' | 'medium' | 'low' | null;
  spansExtracted: number;
  candidatesProposed: number;
  candidatesPromoted: number;
  candidatesRejected: number;
  conflictsCreated: number;
  conflictsFlagged: number;
  requiresHumanReview: boolean;
  quarantineReason: string | null;
  errorCode: string | null;
}
```

### 2.2 Node-by-Node Execution Flow in `packages/db/src/services/documents.ts`
1. **`triageNode`:** Verifies magic bytes (`sniffContentType`), checks `byteSize <= 25MB`, and verifies SHA-256 deduplication.
2. **`ocrRouteNode`:** Executes `deps.ocr.extractDocument` (or page loop). Selects `SarvamVisionOcrAdapter` when `OCR_DRIVER=sarvam` and `SARVAM_API_KEY` is present, `TextractOcrAdapter` when `OCR_DRIVER=textract`, or `LocalMultimodalOcrAdapter` (including real raster image OCR via `tesseract.js` / CLI in `TASK-006`). If the primary cloud OCR throws a network/auth error, logs a structured fallback event and falls back to `LocalMultimodalOcrAdapter` with `providerMode = 'fallback'`. If `0` spans are found across all pages, transitions to `quarantineTerminalNode` (`manual_transcription_required`).
3. **`segmentPacketNode` (`TASK-017`):** Invokes `segmentDocumentPacket(normalizedPages)` from `packages/domain/src/ingestion/packet-segmenter.ts` to split multi-report scans into `PacketSubDocument[]` (`startPage`, `endPage`, `category`, `statedDate`, `statedFacility`, `confidence`) and inserts rows into `document_subpacket` (`0021_complete_v4_scope.sql`).
4. **`classifyNode`:** Runs `classifyDocumentText(filename, fullText)` and reconciles with `subPackets[0]?.category`.
5. **`extractCandidatesNode`:** Invokes `deps.extractor.extract(...)` (`BedrockLlmProvider`, `NvidiaNimExtractor`, or `RuleBasedExtractor`), passing sub-packet page dates and facilities so multi-report scans preserve per-page `observedOn` dates.
6. **`twoStageSpanGateNode`:** Runs `insertFact()` (`validateSpanOffsets`, `validateBoundingBox`, `validateVerbatimSubstring`, `validateValueEntailment`, and `validateFactValue` clinical boundary check) for each candidate. Invalid or hallucinated spans are recorded in `extraction_candidate` with `validation_status = 'rejected'` and `rejected_reason`, never promoted to `evidence_fact`.
7. **`dateScopedConflictAndDeltaNode`:** Runs `detectAndRecordConflicts(q, orgId, patientId)` (using date-scoped `slotQualifier` so serial labs across different dates form a flowsheet series while same-date contradictions create `conflict_group` rows) and `detectNearDuplicates(q, orgId, patientId)`.
8. **`humanReviewInterruptGate`:** Marks all promoted facts `state = 'extracted'` (awaiting human verification in UI) and writes the complete `GraphExecutionResult` (`visitedNodes`, `checkpoints`, `providerMode`) into `audit_event` (`action = 'document.ingested'`).

---

## 3. Agent 2: Grounded Clinical-Admin & Guideline Co-Pilot Graph (`TASK-009`, `TASK-018`)

### 3.1 State Contract (`AssistantGraphState`)
- **Files:** `packages/domain/src/orchestration/workflow-graph.ts`, `apps/web/src/lib/assistant/orchestrator.ts`, `apps/web/src/lib/assistant/tools.ts`
```ts
export interface AssistantPendingActionProposal {
  proposalId: string;
  actionKind: 'create_task' | 'assign_task' | 'generate_studio_draft';
  summaryText: string;
  payload: Record<string, unknown>;
  citedFactIds: string[];
  citedGuidelineIds: string[];
  status: 'awaiting_confirmation' | 'confirmed' | 'cancelled';
}

export interface AssistantGraphState {
  orgId: string;
  userId: string;
  userRole: string;
  patientId: string | null;
  conversationId: string;
  query: string;
  intent: AssistantIntent;
  evidenceCitations: EvidenceCitationCard[]; // [E1], [E2]...
  guidelineCitations: GuidelineCitationCard[]; // [G1], [G2]...
  opdFlowContext: OpdFlowSummaryContext | null;
  pendingActionProposal: AssistantPendingActionProposal | null;
  draftAnswer: string;
  verifiedAnswer: string;
  providerMode: 'live_bedrock' | 'deterministic_grounded';
  refusalReason: string | null;
}
```

### 3.2 Node-by-Node Execution Flow
1. **`intentClassifierNode` (`classify.ts`):** Classifies the user query into:
   - `'unsupported_medical_question'` (any request for diagnosis, TNM staging calculation, prognosis, drug dosing, or treatment recommendation → routes immediately to `boundaryRefusalNode`).
   - `'guideline_knowledge_question'` (requests for NCG or institutional SOP reference passages).
   - `'workflow_action_request'` (requests to create a follow-up task, assign a task, or stage a Studio draft).
   - `'opd_flow_question'` (questions about clinic queue, delayed investigations, or waitlist backfill candidates).
   - `'case_evidence_question'` (questions about patient records, interval deltas, lab trends, conflicts, or readiness).
2. **Retrieval & Proposal Nodes:**
   - `patientEvidenceRetrieverNode`: Queries verified/extracted `evidence_fact` rows, `computeIntervalDelta`, `buildLongitudinalLabFlowsheet`, open conflicts, and checklist gaps (`[E#]`).
   - `institutionalGuidelineRetrieverNode`: Calls `searchGuidelines(q, orgId, query)` against `guideline_document` + `guideline_span`, returning verbatim spans with page numbers and bounding boxes (`[G#]`) linked to `/patients/[id]/sources?guideline=<docId>&page=<page>&span=<spanId>` (`TASK-018`).
   - `actionProposalNode`: When the clinician or coordinator asks the assistant to create a task or draft a referral letter, constructs an `AssistantPendingActionProposal` (`status: 'awaiting_confirmation'`) stored in `chat_message.pending_action_json`—**never mutating the database until the user clicks "Confirm Action" in `AssistantDrawer.tsx`**.
3. **`groundedSynthesisNode`:** Synthesizes the answer using `BedrockLlmProvider` (when `LLM_DRIVER=bedrock` and credentials exist) or `synthesizeDeterministicGroundedAnswer`, strictly citing `[E#]` and `[G#]`. Guideline answers prepend `Reference Guideline Extract — For Clinician Review Only (Not a Patient-Specific Order)`.
4. **`citationVerificationGateNode`:** Verifies that every `[E#]` and `[G#]` tag in `draftAnswer` maps to a retrieved citation card and passes `checkTextForBoundary(draftAnswer)`. Persists `execution_trace_json`, `pending_action_json`, and `provider_mode` in `chat_message` (`0020` migration).

---

## 4. Agent 3: Readiness-Gated OPD Flow & Slot Backfill Coordinator Graph (`TASK-008`)

### 4.1 State Contract & Execution Flow (`opdBackfillWorkflowGraph`)
- **Files:** `packages/domain/src/orchestration/workflow-graph.ts`, `packages/domain/src/opd/slot-optimizer.ts`, `packages/db/src/services/opd.ts`
- **Nodes:**
  1. **`detectVacantOrBlockedSlotNode`:** Validates that the target `opd_appointment_slot` is in state `'vacant'`, `'cancelled'`, `'no_show'`, or `'delayed_investigation'`.
  2. **`queryWaitlistAndReadinessNode`:** Queries `opd_waitlist_entry` (`status = 'waiting'`) joined with `patient_twin_summary` (`readiness_band`, `open_conflict_count`, `missing_critical_count`) and `evidence_fact` (`priority_source_fact_id`).
  3. **`rankReadyCandidatesNode`:** Executes `rankWaitlistCandidatesForSlot()`, filtering strictly to candidates where `readinessBand === 'ready'` and `openConflictCount === 0`, then ordering by source-anchored administrative priority weight (`chemo_cycle_clearance_documented` > `post_op_wound_check_documented` > `expedited_slot_requested` > `new_referral` > `routine_followup`) and earliest `requestedDate`.
  4. **`stageSlotOfferAndNotificationNode` (`coordinatorApprovalGate`):** Upon coordinator confirmation (`offerOpdSlotAction`), transitions `opd_waitlist_entry` to `status = 'offered'` with a 30-minute hold window (`offer_expires_at`), composes a localized `patient_message` (`opd_slot_offer_v1`) in the patient's `primary_language`, and logs `opd.slot_offered` with the full `GraphExecutionResult` trace. When the patient accepts (`acceptOpdSlotOfferAction`), assigns the slot and syncs Milestone B `appointment`.

---

## 5. Agent 4: Multilingual Care Continuity & Attendance Confirmation Graph (`TASK-012`, `TASK-023`, `TASK-024`)

### 5.1 State Contract & Execution Flow (`continuityOutreachWorkflowGraph`)
- **Files:** `packages/domain/src/orchestration/workflow-graph.ts`, `packages/db/src/services/continuity.ts`, `apps/web/src/app/api/v1/continuity/webhook/route.ts`
- **Nodes:**
  1. **`selectVerifiedFactsNode`:** Enforces the invariant that patient/caregiver messages can only reference `verified` ledger facts (`appointment.scheduled`, `instruction.recorded`)—rejecting any unverified or conflicting fact (`unverified_fact_blocked_from_continuity`).
  2. **`translateAndRender11LocaleNode`:** Renders the approved template across all 11 supported languages (`en`, `hi`, `ta`, `te`, `bn`, `mr`, `kn`, `ml`, `gu`, `pa`, `or`) using `SarvamTranslationAdapter` (`mayura:v1`) or deterministic native-script templates (`TASK-012`), running `checkTextForBoundary()` on the rendered body.
  3. **`synthesizeVoiceNoteNode`:** Invokes `SarvamSpeechAdapter.synthesizeSpeech` (`bulbul:v3`) or `generateAudibleFallbackWav()` so every message has a playable spoken voice note for low-literacy patients and consented family caregivers (`caregiver_contact`).
  4. **`clinicianOutreachApprovalGate`:** Requires explicit human approval (`approveMessageAction`) before dispatching via `DeliveryPort` (`WebhookDeliveryAdapter` or `SimulatedDeliveryAdapter` in `TASK-024`).
  5. **`processInboundPatientReplyNode` (`/api/v1/continuity/webhook` in `TASK-023`):** Parses inbound patient/caregiver responses (`confirm_attendance`, `request_reschedule`, `confirm_documents_ready`, or OPD slot offer `accept_slot_offer` / `decline_slot_offer`), updates `patient_message.confirmation_status`, updates the linked `opd_appointment_slot` / `admin_task` state, and appends a SHA-256 hash-chained `audit_event`.
