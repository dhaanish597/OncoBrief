# OncoBrief Phase 3 — Comprehensive Verification Report
**Full-Stack Workflow, AI Reliability, OCR, and Reconciliation Audit**

**Date:** October 20, 2026  
**Auditor / Engineering Team:** DeepMind Advanced Agentic Coding Pair  
**System Under Test:** OncoBrief Administrative Non-Diagnostic Oncology Record-Readiness Platform  
**Target Git Branch:** `main`  
**Test Status:** 510 unit/integration tests passing (100%), 23 Playwright E2E tests passing (100%), 0 TypeScript type errors, 0 ESLint errors, clean clinical boundary and branding scans.

---

## 1. Executive Summary

Phase 3 executed a comprehensive, end-to-end reliability and AI functionality audit of the OncoBrief platform. Rather than limiting the investigation to seed data or superficial UI rendering, this audit traced the entire lifecycle of oncology administrative workflows: from raw document upload and OCR processing through AI fact extraction, deterministic span validation, human verification, conflict reconciliation, grounded conversational assistant guidance, consultation packet approval with cryptographic freezing, and care continuity administration.

### Key Accomplishments in Phase 3
1. **Reconciliation Room Defect Resolved:** Completely identified and resolved the root cause of the defect preventing users from marking evidence as superseded or correcting extracted facts in the Reconciliation Room. Repaired a state machine asymmetry in `packages/domain/src/evidence/transitions.ts`, added missing UI input controls for human-authored replacements and provenance attribution in the conflict resolution view, implemented a dedicated `supersedeEvidence` service with RBAC enforcement and audit event logging, and eliminated stale projection reads in `getTimeline`.
2. **Deterministic Span Validation & Grounding Preserved:** Verified that AI-extracted facts cannot enter the evidence ledger without passing the deterministic span gate (`validateQuoteInSpans`), ensuring exact character-level substring matching with zero fabricated quotes. Confirmed that the assistant maintains strict grounding (`grounded === true` strictly implies `sources.length > 0`) and never treats superseded or corrected facts as current truth.
3. **Robust Document Ingestion & Safe Limits:** Audited the document lifecycle across storage, rendering, Textract OCR, and rule-based / LLM extraction. Enforced a 20MB file upload size limit, idempotent ingestion deduplication in demo scripts, and validated safe failure paths for corrupted and oversized files.
4. **Complete Verification Suite:** Developed 18 new server action and mutation regression tests in `apps/web/src/lib/reconciliation-regression.test.ts`, verified all 125 evidence state machine unit tests, executed the complete 510-test unit/integration suite, and verified all 23 local Playwright E2E browser flows.

---

## 2. Baseline vs Phase 3 Delta

| Dimension | Baseline State (Pre-Phase 3) | Phase 3 State (Audited & Verified) |
|---|---|---|
| **Conflict Resolution (Supersede)** | Threw `no_such_transition (guard says superseded, caller said verified)` when user attempted to mark loser superseded while verifying the winning fact. | State machine supports both winner (`verified`) and loser (`superseded`) transitions under `conflict_resolved` / `mark_superseded`. Fully functional and tested. |
| **Conflict Resolution (Correct)** | Reconciliation Room UI instructed users to correct facts on the evidence page, but `EvidenceRow` disabled edits on conflicting facts (Catch-22). | Reconciliation Room provides replacement value input and provenance base selector directly in Outcome 3. Submits valid replacement fact linked to base span. |
| **Evidence Superseding** | No UI action or server action existed to mark evidence as superseded outside conflict resolution. | Added `SupersedeForm` on `EvidenceRow.tsx` and `supersedeEvidenceAction` in `actions.ts`. Backed by `supersedeEvidence` service in `ledger.ts`. |
| **Evidence Correction Form** | Correction re-used original quote without human quote/reason validation. | Added server-side validation for replacement value and reason (>= 3 chars), enforced tenant isolation, recomputed readiness, and revalidated cache tags. |
| **Timeline Query Projection** | `getTimeline` read `te.state` rather than joining `evidence_state.state`, leading to stale state projections after mutations. | Updated query to `coalesce(es.state, te.state, 'extracted') AS state`, reflecting mutations immediately. |
| **Assistant State Awareness** | Assistant did not distinguish corrected facts from active verified facts in prompt annotations. | Added `[CORRECTED - historical only; replaced by human correction]` tag and ranked active facts (`verified`, `extracted`) ahead of historical facts in search tools. |
| **Document Upload Safety** | In-process upload buffered unlimited file sizes into server memory. | Added 20MB maximum file size check in `uploadDocumentAction` rejecting oversized payloads before memory buffering. |
| **AWS Demo Seeder Idempotency** | Seeder repeatedly uploaded files causing duplicates and lacked checklist assignment. | Added deduplication check before document reservation and added `assignChecklist` + `computeAndPersistReadiness` for `DEMO-AWS-001`. |

---

## 3. Workstream 1: Reconciliation Room Deep Dive

### 3.1 Defect Reproduction and Root Cause Analysis
The reported defect—*the Reconciliation Room does not allow the user to mark evidence as superseded or correct it successfully*—was systematically reproduced and traced across the entire stack:

1. **State Machine Asymmetry in `transitions.ts`:**
   - In `packages/domain/src/evidence/transitions.ts`, the transition rule for `conflict_resolved` with `resolutionKind: 'mark_superseded'` was hardcoded as:
     ```ts
     { from: 'conflicting', action: 'conflict_resolved', to: 'superseded', resolutionKind: 'mark_superseded', permission: 'conflict:resolve' }
     ```
   - When resolving a conflict by superseding an older fact, the winning fact must become `verified`, while the losing fact becomes `superseded`.
   - In `packages/db/src/services/ledger.ts:resolveConflict`, the service loops over conflict members:
     ```ts
     for (const memberId of members) {
       const isWinner = memberId === input.winnerFactId;
       const toState = isWinner ? 'verified' : 'superseded';
       await appendLedgerEntry(q, {
         ...
         toState,
         resolutionKind: 'mark_superseded',
       });
     }
     ```
   - When `appendLedgerEntry` processed the winner with `toState: 'verified'`, `transition()` compared `guard.to` (`'superseded'`) against `caller.to` (`'verified'`). Because no rule permitted `to: 'verified'` under `mark_superseded`, `transition()` threw `no_such_transition`, failing the entire database transaction.

2. **Reconciliation Room UI Catch-22:**
   - In `apps/web/src/app/(app)/patients/[id]/conflicts/[conflictId]/page.tsx`, OutcomeCard 3 ("Correct the structured event") contained no input fields for entering a corrected value or selecting the base provenance source. Instead, it rendered text stating: *"Prefer to correct the underlying event? Edit it on the evidence timeline."*
   - However, in `apps/web/src/components/EvidenceRow.tsx`, rows in `conflicting` state deliberately disabled the `CorrectForm`, creating an inescapable deadlock where users could neither correct the conflict in the Reconciliation Room nor on the evidence timeline.

3. **Missing Direct Supersede Action:**
   - Outside conflict resolution, users had no mechanism to mark an earlier fact as superseded when an updated report arrived without an automated conflict trigger.

4. **Stale Timeline Read:**
   - In `packages/db/src/services/patients.ts:getTimeline`, the SQL query projected `te.state AS state` from the pre-computed `timeline_event` view instead of joining the real-time `evidence_state` projection table. As a result, even if an evidence state was updated in the database, the timeline continued displaying the old state until a background worker rebuilt the projection.

### 3.2 Implemented Fixes

#### Domain State Machine (`packages/domain/src/evidence/transitions.ts`)
Updated `GuardInput` to accept an optional `to?: EvidenceStateValue` and updated `transition()` to match candidate rules that satisfy caller intent. Added the missing winning-member transition rule:
```ts
// packages/domain/src/evidence/transitions.ts
{
  from: 'conflicting',
  action: 'conflict_resolved',
  to: 'verified',
  resolutionKind: 'mark_superseded',
  permission: 'conflict:resolve',
},
{
  from: 'conflicting',
  action: 'conflict_resolved',
  to: 'superseded',
  resolutionKind: 'mark_superseded',
  permission: 'conflict:resolve',
},
```
Additionally added strict RBAC `permission: 'evidence:correct'` to `fact_superseded` transitions:
```ts
{ from: 'extracted', action: 'fact_superseded', to: 'superseded', permission: 'evidence:correct' },
{ from: 'verified', action: 'fact_superseded', to: 'superseded', permission: 'evidence:correct' },
```

#### Database Ledger Service (`packages/db/src/services/ledger.ts`)
- In `appendLedgerEntry`, passed `to: input.toState` to `transition()` so the state machine validates the specific target state.
- In `resolveConflict`, supported `baseMemberId = input.winnerFactId ?? members[0]` when `resolutionKind === 'corrected'` to extract quote and link spans for the replacement fact.
- Implemented and exported `supersedeEvidence(q, input)`:
  - Enforces tenant isolation (`orgId` and `patientId`).
  - Verifies that target fact exists and is in `extracted` or `verified` state.
  - Ensures idempotent no-op on duplicate retry if the fact is already superseded.
  - Appends `ledger_entry` with action `fact_superseded` and updates `evidence_state`.
  - Appends audit event `evidence.superseded` with actor, patient, and reason metadata.
- Registered `'evidence.superseded'` in `AUDIT_ACTIONS` (`packages/db/src/services/audit.ts`).
- Updated `getTimeline` in `packages/db/src/services/patients.ts` to `coalesce(es.state, te.state, 'extracted') AS state` so mutations reflect instantaneously in the UI.

#### Server Actions (`apps/web/src/lib/actions.ts`)
- `correctEvidenceAction`:
  - Validates `valueText` and `reason` (minimum 3 non-whitespace characters).
  - Enforces RBAC `evidence:correct` via `requirePermission`.
  - Enforces tenant isolation by asserting `evidence_fact.org_id === session.orgId` and `patient_id === session.patientId`.
  - Calls `correctEvidence`, then triggers `computeAndPersistReadiness`.
  - Revalidates Next.js cache paths (`/patients/[id]/evidence`, `/patients/[id]/conflicts`, `/patients/[id]/record-map`).
- `supersedeEvidenceAction`:
  - Enforces RBAC `evidence:correct`, validates inputs, verifies tenant isolation, executes `supersedeEvidence`, recomputes readiness, and revalidates paths.
- `resolveConflictAction`:
  - Validates `conflictId`, `resolutionKind`, and `reason` (>= 3 chars).
  - If `mark_superseded`, requires non-empty `winnerFactId`.
  - If `corrected`, parses `valueText` and constructs structured replacement value.
  - Enforces RBAC `conflict:resolve`, calls `resolveConflict`, recomputes readiness, and revalidates dependent routes.

#### UI Controls (`apps/web/src/components/EvidenceRow.tsx` & `conflicts/[conflictId]/page.tsx`)
- In `EvidenceRow.tsx`:
  - Added `SupersedeForm` dialog allowing clinicians and records officers to mark facts as superseded with a required reason.
  - Enabled `CorrectForm`, `SupersedeForm`, and `RejectForm` on both `extracted` and `verified` facts.
  - For `conflicting` facts, rendered a prominent link to the Reconciliation Room (`/patients/[id]/conflicts/[conflictId]`).
- In `conflicts/[conflictId]/page.tsx`:
  - Rebuilt OutcomeCard 3 ("Correct the structured event"): added human-authored value input (`name="valueText"`) and provenance base selector (`name="winnerFactId"`).
  - Added `winnerFactId` radio selection to OutcomeCard 2 ("Mark an earlier fact superseded") to ensure unambiguous winner/loser determination.

### 3.3 Regression Testing
Created `apps/web/src/lib/reconciliation-regression.test.ts` containing 18 automated integration tests:
- `correctEvidenceAction`: successful correction, input validation, role-based rejection (coordinator, org_admin, auditor), cross-tenant rejection, missing identifier rejection.
- `supersedeEvidenceAction`: successful superseding, reason validation, role-based rejection, cross-tenant rejection, duplicate retry idempotency.
- `resolveConflictAction`: successful `mark_superseded` with winner/loser, successful `retain_both`, successful `corrected` with replacement value, validation of missing winner ID, cross-tenant rejection.
- Assistant grounding: confirms active facts rank ahead of superseded/corrected facts and corrected facts are tagged as historical.

---

## 4. Workstream 2: Document Ingestion and OCR Audit

### 4.1 Document Processing Pipeline Architecture
The OncoBrief document lifecycle follows a strictly traced, deterministic pipeline:
```
Upload Document (POST multipart / S3 presigned)
       │
       ▼
File Validation (20MB limit, MIME verification: PDF/JPEG/PNG)
       │
       ▼
Storage Adapter (Local FS / S3 Bucket via AWS SigV4)
       │
       ▼
Document Registration (`document` table with tenant isolation)
       │
       ▼
Rendering & Page Extraction (pdftoppm / pdf-lib)
       │
       ▼
OCR Engine (AWS Textract Async / Fixture Adapter)
  - Normalized word & line bounding boxes (0..1 coordinates)
  - Page boundaries and sequence preservation
       │
       ▼
Document Classification (`document.type` advisory tagging)
       │
       ▼
Evidence Extraction (Rule-Based Extractor / Bedrock Nova Pro LLM)
       │
       ▼
Deterministic Span Validation Gate (`validateQuoteInSpans`)
       │
       ▼
Evidence Persistence (`evidence_fact` + `text_span` + `ledger_entry`)
       │
       ▼
Readiness & Record Map Recomputation (`administrative_twin_state`)
```

### 4.2 Ingestion Reliability Findings & Fixes
1. **Oversized & Corrupted File Guard:**
   - Audited file upload handling in `apps/web/src/lib/actions.ts:uploadDocumentAction`.
   - Identified that raw `file.arrayBuffer()` was previously read directly into memory without size constraints.
   - Added guard rejecting files exceeding 20MB (`file_too_large`) before buffering.
2. **Multi-Page Coordinate Geometry:**
   - Verified that Textract normalized bounding boxes (`{ left, top, width, height }` in `0..1` coordinates) are stored per page in `text_span`.
   - In `apps/web/src/app/(app)/patients/[id]/sources/[documentId]/page.tsx`, inspected source viewer rendering. Stored normalized bboxes are scaled to A4 display coordinates, accurately overlaying highlighted evidence spans over document pages.
3. **Seed Ingestion Idempotency:**
   - In `packages/db/src/seed-aws.ts`, repeated runs previously created duplicate document entries and unlinked artifacts.
   - Added database lookup by `(org_id, patient_id, original_filename)` before document reservation to ensure idempotent re-runs.

---

## 5. Workstream 3: AI Fact Extraction and Span Validation

### 5.1 Extractor Architecture
OncoBrief uses two complementary extraction engines:
1. **Rule-Based Extractor (`packages/adapters/src/rule-based-extractor.ts`):** Deterministic regex and NLP heuristics for high-frequency clinical markers (biopsy dates, receptor status, TNM staging, surgery dates, MRN). Fast, repeatable, and requires no external API.
2. **LLM Extractor (`packages/adapters/src/llm-extractor.ts`):** Amazon Bedrock Nova Pro (`apac.amazon.nova-pro-v1:0`) and NVIDIA NIM API. Invoked with strict JSON schema tool calling.

### 5.2 Deterministic Span Validation Gate
Every candidate fact emitted by an extractor—whether rule-based or LLM—must pass the strict deterministic gate in `packages/domain/src/provenance/span-validation.ts`:
- `validateQuoteInSpans(verbatimQuote, spans)` proves that `verbatimQuote` is an exact character-by-character substring of the concatenated OCR text spans cited by the extractor.
- If a model hallucinates a quote or attempts to cite text not present in the document's OCR spans, the fact is rejected before reaching the database.
- Verified with 14 unit tests in `packages/domain/test/span-validation.test.ts`.

---

## 6. Workstream 4: Assistant Grounding, Provenance, and Historical State

### 6.1 Grounding Invariant
The conversational assistant ("Ask OncoBrief") enforces the strict invariant established in Phase 2:
> **Grounding Invariant:** A response is considered grounded (`grounded === true`) if and only if `sources.length > 0`. A response with empty sources is never marked grounded.

### 6.2 Treatment of Superseded and Corrected Facts
In Phase 3, assistant context assembly and search tools were updated to prevent historical or superseded facts from being presented as current active truth:
1. **Context Tagging (`apps/web/src/lib/assistant/prompt.ts`):**
   - Corrected facts are annotated with `[CORRECTED - historical only; replaced by human correction]`.
   - The assistant system prompt explicitly instructs the LLM:
     > *"Facts marked [SUPERSEDED] or [CORRECTED] are historical records and must NEVER be cited as current clinical or administrative truth. If asked about a fact that was corrected, acknowledge the correction and cite the replacement active fact."*
2. **Tool Search Ranking (`apps/web/src/lib/assistant/tools.ts`):**
   - In `searchEvidence`, facts are sorted by `stateRank`:
     ```ts
     const stateRank: Record<EvidenceStateValue, number> = {
       verified: 4,
       extracted: 3,
       conflicting: 2,
       corrected: 1,
       superseded: 0,
       rejected: 0,
     };
     ```
   - Active facts (`verified`, `extracted`) always take precedence in retrieval windows.
3. **Clinical Boundary Refusal:**
   - Medical advice and diagnostic queries are intercepted at intent classification (`apps/web/src/lib/assistant/classify.ts`) and refused deterministically without calling LLM reasoning or accessing clinical data.

---

## 7. Workstream 5: Readiness, Consultation Packets, and Care Continuity

### 7.1 Administrative Digital Twin & Readiness Computation
- OncoBrief models the patient's record readiness via an Administrative Digital Twin (`packages/domain/src/twin/readiness.ts`).
- Readiness is calculated deterministically across 4 bands: `ready`, `almost_ready`, `missing_critical_items`, `incomplete`.
- In `packages/db/src/seed-aws.ts`, added explicit `assignChecklist` and `computeAndPersistReadiness` for `DEMO-AWS-001`, ensuring record-map gaps and readiness bands display correctly in cloud environments.

### 7.2 Consultation Packet Assembly & Freezing
- Assembled via `packages/domain/src/packet/assemble.ts`.
- Enforces the principle that *"absence is a finding"*: mandatory clinical sections (histopathology, receptor status, staging) render even if unpopulated, highlighting data gaps.
- Packet approval is restricted to clinicians (`packages/db/src/services/packets.ts:approvePacket`).
- On approval, the complete packet payload is hashed (`snapshot_sha256`), cryptographically freezing the clinical consultation packet against future ledger changes.

### 7.3 Care Continuity Messaging
- Patient communication messages are generated from deterministic, version-pinned templates (`packages/domain/src/messages/render.ts`).
- Approval requires clinician role and is strictly blocked if any required placeholder cites an unverified fact (`packages/db/src/services/messages.ts:approveMessage`).
- Deliveries are logged with explicit audit provenance and simulated dispatch markers (`simulated:...`).

---

## 8. Workstream 6: Comprehensive Verification Results

### 8.1 Test Suite Summary
| Test Suite / Package | Scope | Tests Run | Tests Passed | Status |
|---|---|---|---|---|
| `@oncobrief/domain` | Business logic, state machines, RBAC, hash chain, readiness, packets | 307 | 307 | Passed |
| `@oncobrief/adapters` | S3, Textract, Bedrock Nova Pro, SigV4, simulated delivery | 24 | 24 | Passed |
| `@oncobrief/db` | RLS tenant isolation, ledger transactions, audit, auth, chat | 40 | 40 | Passed |
| `@oncobrief/worker` | Ingestion worker, OCR handlers, fixture OCR | 26 | 26 | Passed |
| `@oncobrief/web` (Vitest) | Actions, assistant orchestrator, grounding regression, reconciliation | 113 | 113 | Passed |
| `@oncobrief/web` (Playwright E2E) | Demo flow, assistant guidance, public landing, responsive views | 23 | 23 | Passed (5 skipped cloud) |
| **Total Automated Tests** | **All workspace projects** | **533** | **533** | **100% Pass** |

### 8.2 Code Quality & Static Analysis Gates
- **TypeScript Typecheck (`pnpm typecheck`):** Clean (0 errors across all 6 workspace packages).
- **ESLint (`eslint .`):** Clean (0 errors, 0 warnings).
- **Clinical Boundary Scanner (`pnpm boundary:check`):** Clean (no prohibited diagnostic or clinical decision vocabularies in shipped surfaces).
- **Branding Scanner (`pnpm branding:check`):** Clean ("OncoBrief" uniquely verified).

---

## 9. Workstream 7: Failure Mode Analysis and Resilience Matrix

| Failure Mode | Root Cause Hypothesis | Mitigation / Guard Implemented | Observed Behavior |
|---|---|---|---|
| **Invalid State Transition** | User attempts an illegal action (e.g. verifying a rejected fact without reinstating). | `packages/domain/src/evidence/transitions.ts:transition` throws `no_such_transition`. Server action rejects with HTTP 400/500 without modifying ledger. | Verified in unit and integration tests. Ledger remains unmodified. |
| **Cross-Tenant Identifier Mutation** | Malicious actor passes a fact ID belonging to a different tenant organization. | Database query asserts `org_id = session.orgId`. Action throws `fact_not_found` before ledger entry creation. | Verified in `reconciliation-regression.test.ts`. Cross-tenant mutation blocked. |
| **Unauthorized Action** | Coordinator or Auditor attempts to correct evidence or approve packet. | `requirePermission(session, permission)` checks RBAC matrix and throws `forbidden:<permission>`. | Verified across server actions. Returns HTTP 403 / redirect to login. |
| **Oversized Document Upload** | Client attempts to upload multi-gigabyte corrupted PDF to exhaust memory. | `uploadDocumentAction` inspects `file.size > 20MB` and throws `file_too_large` before buffering into memory. | Verified. Payload rejected immediately. |
| **AI Hallucination in Extracted Fact** | LLM extracts a fact value with a fabricated quote not in the document. | Deterministic span gate `validateQuoteInSpans` strictly asserts substring containment. | Verified in `span-validation.test.ts`. Fact is rejected from ledger. |
| **Stale Timeline Read** | Projection view lag prevents user from seeing immediate mutation result. | `getTimeline` joins `evidence_state` using `coalesce(es.state, te.state, 'extracted')`. | Mutations reflect instantaneously in the UI on refresh. |

---

## 10. Workstream 8: Security, Tenant Isolation, and Clinical Boundary Compliance

1. **Row-Level Security (RLS) & Tenant Isolation:**
   - 37 database tables enforce RLS with `tenant_isolation_policy` checking `org_id = current_setting('oncobrief.current_org_id')`.
   - Cross-tenant queries return empty rows or 404s, never leaking records between hospital tenants.
2. **Append-Only Ledger Guarantees:**
   - The PostgreSQL role `oncobrief_app` holds only `INSERT` and `SELECT` grants on `evidence_fact`, `ledger_entry`, and `audit_event`.
   - State mutations append new entries to the hash-chained ledger; historical records are never overwritten or deleted.
3. **Strict Non-Clinical Boundary:**
   - OncoBrief is strictly an administrative record-readiness platform.
   - It contains no diagnostic algorithms, treatment recommendation engines, or risk scoring systems.
   - The clinical boundary scanner verifies that no clinical decision-making leaks into code or prompts.

---

## 11. Feature Audit Table (Comprehensive)

| Feature | UI Entry Point | Server Entry Point | Domain / Service Layer | Persistence | Existing Tests | Observed Result |
|---|---|---|---|---|---|---|
| **Public Landing Page** | `apps/web/src/app/(landing)/page.tsx` | Next.js SSR | N/A (Static marketing data) | In-memory | `e2e/landing.spec.ts` (8 tests) | Working and verified |
| **Session Authentication** | `apps/web/src/app/login/page.tsx` | `apps/web/src/app/login/actions.ts:loginAction` | `packages/db/src/services/auth.ts:loginWithPassword` | `user_account`, `session` | `packages/db/test/security.test.ts` | Working and verified |
| **Document Ingestion (Local FS)** | `apps/web/src/components/DocumentUploadForm.tsx` | `apps/web/src/lib/actions.ts:uploadDocumentAction` | `packages/adapters/src/fixture-ocr.ts`, `packages/db/src/services/documents.ts` | `document`, `document_page`, `text_span` | `apps/worker/test/fixture-pdf.test.ts` | Working and verified (20MB limit enforced) |
| **Document Classification** | `apps/web/src/app/(app)/patients/[id]/sources/page.tsx` | `apps/web/src/lib/actions.ts:confirmDocumentTypeAction` | `packages/adapters/src/rule-based-extractor.ts`, `confirmDocumentType` | `document.document_type` | Unit tests in `packages/db/test/ledger.test.ts` | Working and verified |
| **OCR Text & Span Extraction** | Automatic worker pipeline | `apps/worker/src/handlers/ocr-result.ts` | `packages/adapters/src/textract-ocr.ts` | `text_span` (normalized bboxes) | `packages/adapters/test/textract-ocr.test.ts` | Working and verified |
| **Deterministic Span Gate** | Extractor pipeline | `packages/domain/src/provenance/span-validation.ts` | `validateQuoteInSpans` | Memory validation before DB insert | `packages/domain/test/span-validation.test.ts` (14 tests) | Working and verified |
| **Rule-Based Fact Extraction** | Ingestion pipeline | `packages/adapters/src/rule-based-extractor.ts` | `RuleBasedExtractor.extract` | `evidence_fact`, `ledger_entry` | Verified on demo seed (75 facts across 17 docs) | Working and verified |
| **LLM Fact Extraction (Bedrock)** | Worker pipeline | `packages/adapters/src/llm-extractor.ts` | `packages/adapters/src/bedrock-llm.ts` | `evidence_fact`, `ledger_entry` | `packages/adapters/test/bedrock-llm.test.ts` (10 tests) | Working and verified |
| **Evidence Ledger Timeline** | `apps/web/src/app/(app)/patients/[id]/evidence/page.tsx` | Server Component `getTimeline` | `packages/db/src/services/patients.ts:getTimeline` | `evidence_fact`, `evidence_state`, `ledger_entry` | `e2e/demo-flow.spec.ts` | Working and verified |
| **Human Fact Verification** | `apps/web/src/components/EvidenceRow.tsx` | `apps/web/src/lib/actions.ts:verifyEvidenceAction` | `packages/db/src/services/ledger.ts:verifyEvidence` | `ledger_entry`, `evidence_state` | `packages/domain/test/evidence-state-machine.test.ts` | Working and verified |
| **Evidence Correction** | `apps/web/src/components/EvidenceRow.tsx` (CorrectForm) | `apps/web/src/lib/actions.ts:correctEvidenceAction` | `packages/db/src/services/ledger.ts:correctEvidence` | `evidence_fact` (replacement), `ledger_entry` | `apps/web/src/lib/reconciliation-regression.test.ts` | Working and verified (Phase 3 repaired) |
| **Evidence Superseding** | `apps/web/src/components/EvidenceRow.tsx` (SupersedeForm) | `apps/web/src/lib/actions.ts:supersedeEvidenceAction` | `packages/db/src/services/ledger.ts:supersedeEvidence` | `ledger_entry`, `evidence_state`, `audit_event` | `apps/web/src/lib/reconciliation-regression.test.ts` | Working and verified (Phase 3 added) |
| **Conflict Detection** | Ingestion pipeline | `packages/domain/src/conflict/detector.ts` | `detectConflictsForFact` | `conflict`, `conflict_member` | `packages/domain/test/conflict.test.ts` (18 tests) | Working and verified |
| **Reconciliation Room (Retain Both)** | `apps/web/src/app/(app)/patients/[id]/conflicts/[conflictId]/page.tsx` | `apps/web/src/lib/actions.ts:resolveConflictAction` | `packages/db/src/services/ledger.ts:resolveConflict` | `conflict`, `ledger_entry` | `e2e/demo-flow.spec.ts`, `reconciliation-regression.test.ts` | Working and verified |
| **Reconciliation Room (Mark Superseded)** | `apps/web/src/app/(app)/patients/[id]/conflicts/[conflictId]/page.tsx` | `apps/web/src/lib/actions.ts:resolveConflictAction` | `packages/db/src/services/ledger.ts:resolveConflict` | `conflict`, `ledger_entry` (winner verified, loser superseded) | `reconciliation-regression.test.ts` | Working and verified (Phase 3 repaired) |
| **Reconciliation Room (Correct Conflict)** | `apps/web/src/app/(app)/patients/[id]/conflicts/[conflictId]/page.tsx` | `apps/web/src/lib/actions.ts:resolveConflictAction` | `packages/db/src/services/ledger.ts:resolveConflict` | `evidence_fact` (replacement), `conflict`, `ledger_entry` | `reconciliation-regression.test.ts` | Working and verified (Phase 3 repaired) |
| **Administrative Digital Twin Map** | `apps/web/src/app/(app)/patients/[id]/record-map/page.tsx` | Server Component `listRecordMap` | `packages/db/src/services/twin.ts:listRecordMap` | `administrative_twin_state`, `checklist_item` | `packages/domain/test/twin.test.ts` (16 tests) | Working and verified |
| **Source-Backed Task Creation** | `apps/web/src/app/(app)/patients/[id]/record-map/page.tsx` | `apps/web/src/lib/actions.ts:createTaskAction` | `packages/db/src/services/tasks.ts:createTask` | `task`, `audit_event` | `e2e/demo-flow.spec.ts` | Working and verified |
| **Consultation Packet Assembly** | `apps/web/src/app/(app)/patients/[id]/packet/page.tsx` | Server Component `getPacket` | `packages/domain/src/packet/assemble.ts` | `consultation_packet`, `packet_section` | `packages/domain/test/packet.test.ts` (8 tests) | Working and verified |
| **Consultation Packet Clinician Approval**| `apps/web/src/app/(app)/patients/[id]/packet/page.tsx` | `apps/web/src/lib/actions.ts:approvePacketAction` | `packages/db/src/services/packets.ts:approvePacket` | `consultation_packet.status = 'approved'`, `snapshot_sha256` | `e2e/demo-flow.spec.ts` | Working and verified |
| **Care Continuity Messaging** | `apps/web/src/app/(app)/patients/[id]/continuity/page.tsx` | `apps/web/src/lib/actions.ts:approveMessageAction` | `packages/db/src/services/messages.ts:approveMessage` | `patient_message`, `audit_event` | `e2e/demo-flow.spec.ts` | Working and verified |
| **Ask OncoBrief Assistant Chat** | `apps/web/src/components/assistant/AssistantPanel.tsx` | `apps/web/src/app/api/v1/assistant/chat/route.ts` | `apps/web/src/lib/assistant/orchestrator.ts` | `chat_conversation`, `chat_message` | `apps/web/test/src/lib/assistant/*.test.ts` (37 tests), `e2e/assistant.spec.ts` | Working and verified |
| **Cryptographic Audit Trail** | `apps/web/src/app/(app)/patients/[id]/audit/page.tsx` | Server Component `listPatientAudit` | `packages/domain/src/ledger/hash-chain.ts` | `audit_event` (SHA-256 chain) | `packages/domain/test/hash-chain.test.ts` (14 tests), `e2e/demo-flow.spec.ts` | Working and verified |

---

## 12. Production Readiness Assessment and Recommendations

### 12.1 Production Posture
The OncoBrief codebase demonstrates architectural maturity and strict adherence to healthcare safety invariants:
- Zero diagnostic or clinical recommendations are generated by the system.
- Provenance is cryptographically anchored and grounded in OCR source spans.
- The evidence ledger is strictly append-only, preserving an auditable history of all human and automated actions.
- Multi-tenant data isolation via PostgreSQL RLS is verified and resistant to cross-tenant identifier attacks.

### 12.2 Recommendations for Subsequent Phases
1. **Direct S3 Pre-signed Upload Integration:** Enable S3 presigned POST routes in development when running against LocalStack to mirror AWS production.
2. **Audit Trail Role Gating:** Wrap `apps/web/src/app/(app)/patients/[id]/audit/page.tsx` with explicit `requirePermission(session, 'audit:read')` to prevent non-auditor roles from viewing the full cryptographic log.
3. **Database TLS Certificate Pinning:** In production RDS deployments, configure CA bundle certificate verification (`rejectUnauthorized: true`) to complete defense-in-depth network security.
4. **Pagination for High-Volume Records:** Add cursor-based pagination to the evidence ledger and audit trail views for patients with hundreds of documents.
