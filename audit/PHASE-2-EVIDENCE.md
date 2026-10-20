# OncoBrief Phase 2 — Evidence Correctness and Source-Grounding Verification Report

**Date:** 2026-10-20  
**Status:** Completed & Verified  
**Milestone:** Phase 2 — Evidence Correctness, Source-Grounding, and Trustworthy Missing-Document Reconciliation  

---

## 1. Executive Summary

Phase 2 addresses critical defects in evidence grounding, source citation, and missing-document reconciliation identified during the codebase audit:
1. The assistant previously responded to *"Which required documents are missing?"* with `grounded: true` and an empty `sources: []` array.
2. Gap evidence for missing documents lacked a `documentId`, which caused downstream filtering code to drop the sources supporting the conclusion.
3. Assistant prose leaked raw internal database UUIDs (`documentId=<uuid>`) and internal storage paths into clinician-facing messages.
4. Documents in processing pipelines were prematurely classified as missing, and documents with zero extracted facts were treated as absent in search and case summaries.
5. Test suites lacked regression coverage for end-to-end evidence grounding invariants and edge cases.

All defects have been resolved without breaking existing contracts or requiring database schema migrations. A comprehensive 14-test regression suite has been introduced and all unit, domain, adapter, web, typecheck, lint, and build verification gates pass cleanly.

---

## 2. Confirmed Root Causes

### Defect 1: Assistant Returning `grounded: true` with `sources: []`
* **Confirmed Root Cause:** In `apps/web/src/lib/assistant/orchestrator.ts:145`, unsatisfied missing-document gaps were mapped into evidence items with `documentId: g.satisfiedByDocumentId ?? ''`. Because missing documents by definition have no satisfying document, `documentId` was empty string `''`.
* At line 488, the orchestrator applied `.filter((s) => s.documentId !== '')` before assembling the final `sources` payload, thereby discarding all gap items.
* However, grounding evaluation (`isEvidenceAnswerGrounded`) occurred prior to this filter at line 455 based on the raw retrieved items. As a result, when the LLM correctly cited the items using `[E1]`, grounding returned `grounded: true`, while the filtered source list was completely empty (`sources: []`).
* Furthermore, `orchestrator.ts` returned `grounded: grounding === 'grounded'` without asserting that `sources.length > 0`.

### Defect 2: Missing `documentId` in Gap Evidence Dropping Citations
* **Confirmed Root Cause:** The source-selection logic in `orchestrator.ts` conflated "evidence source" with "uploaded physical document". An unsatisfied gap is an administrative checklist requirement derived from the patient's digital twin requirements, not a physical PDF.
* Dropping items without a `documentId` prevented the assistant from citing the checklist requirement as legitimate evidence for the missing-document finding.
* The UI `SourceCardData` interface also strictly expected `documentId: string`, preventing non-document requirements from rendering properly.

### Defect 3: Raw Identifier and Storage Path Leakage in Assistant Prose
* **Confirmed Root Cause:** In `apps/web/src/lib/assistant/prompt.ts:73`, evidence lines were formatted as:
  `source: "${item.documentName || 'Document'}" (documentId=${item.documentId}) ...`
  This explicitly prompted the LLM to output strings like `"Found in documentId=11111111-1111-1111-1111-111111111111"`.
* In addition, system instructions lacked explicit negative constraints prohibiting the reproduction of internal UUIDs, database keys, or object storage URLs, and `orchestrator.ts` lacked a post-generation sanitization pass.

### Defect 4: Inadequate Ingestion-State Handling & Test Gaps
* **Confirmed Root Cause:**
  1. `packages/domain/src/twin/gaps.ts` evaluated any document that was not `confirmed` as failing to satisfy a requirement. Ingest-in-progress documents (`received`, `rendering`, `ocr_running`, `classifying`, `extracting`) were classified as definitively `missing` rather than `partial`.
  2. `findDocument` in `apps/web/src/lib/assistant/tools.ts` only searched `getTimeline()`. Uploaded documents with 0 extracted facts had no timeline entries and were thus reported as non-existent.
  3. No automated regression tests checked that `grounded: true` strictly entails `sources.length > 0`, that UUIDs never appear in prose, or that processing documents are distinguished from absent records.

---

## 3. Files Changed and Detailed Rationale

| File | Nature of Change | Rationale |
|---|---|---|
| `packages/domain/src/twin/gaps.ts` | Modified | Added optional `ingestStatus` and `factCount` fields to `DocumentForGap`. Updated `evaluateGaps` so in-processing documents result in `status: 'partial'` (with `candidateDocumentId`) instead of `status: 'missing'`. Confirmed documents with 0 facts evaluate to `status: 'satisfied'`. |
| `packages/domain/test/twin.test.ts` | Modified | Added unit tests verifying `evaluateGaps` behavior for documents in processing states and zero-fact confirmed documents. |
| `packages/db/src/services/twin.ts` | Modified | Updated `evaluateAndPersistGaps` to query `ingest_status` from the `document` table and pass it to `evaluateGaps`. |
| `apps/web/src/lib/assistant/tools.ts` | Modified | In `findDocument`, fall back to querying `listDocuments` when the timeline has no facts for a patient, ensuring uploaded documents with 0 extracted facts are found and reported with their ingest status. In `getCaseContext`, compute document count from `listDocuments`. In `searchEvidence`, prioritize active verified/extracted facts over rejected/superseded facts. |
| `apps/web/src/lib/assistant/prompt.ts` | Modified | 1. Removed `(documentId=${item.documentId})` from `buildEvidenceBlock`.<br>2. Annotated rejected, superseded, and conflicting evidence items (`[REJECTED]`, `[SUPERSEDED]`, `[CONFLICTING]`).<br>3. Updated `ASSISTANT_SYSTEM_PROMPT` with strict rules against UUID/internal ID emission and presenting invalid evidence as active facts.<br>4. Exported `findCitedEvidenceItems` with marker-aware matching.<br>5. Updated `isEvidenceAnswerGrounded` to return `'no_evidence_found'` for honest "insufficient evidence" answers. |
| `apps/web/src/lib/assistant/orchestrator.ts` | Modified | 1. Mapped missing-document gaps to legitimate requirement facts (`factType: 'record.requirement'`, `documentName: 'Record Checklist: ' + g.label`, `state: g.status`, `verbatimQuote: g.rationale`, `pageNumber: null`).<br>2. Updated `attachHref`: checklist requirements link to `/patients/${patientId}/record-map`, tasks link to `/tasks`, documents link to `/sources/${documentId}`.<br>3. Changed filter from `s.documentId !== ''` to `s.href !== ''`.<br>4. Added `sanitizeUserFacingProse` to strip UUIDs, `documentId=...`, `id=...`, and storage URLs from user-facing prose.<br>5. Enforced hard invariant: `grounded: Boolean(grounding === 'grounded' && sources.length > 0)`.<br>6. Added navigation action `OPEN_MISSING_DOCUMENTS` when top source is a checklist requirement. |
| `apps/web/src/components/assistant/SourceCard.tsx` | Modified | Updated `SourceCardData.documentId` to `string | null` to support non-document checklist requirements. |
| `apps/web/src/components/assistant/AssistantPanel.tsx` | Modified | Updated composite React `key` to `s.evidenceFactId + (s.documentId ?? '')` to avoid collisions on null document IDs. |
| `apps/web/src/lib/assistant/orchestrator.test.ts` | Modified | Updated test mock payloads to match requirement/grounding semantics. |
| `apps/web/src/lib/assistant/grounding-regression.test.ts` | Added | 14 regression tests covering all Phase 2 requirements and invariants. |
| `audit/feature-inventory.csv` | Modified | Updated Row 51 (`Assistant,Evidence grounding + source cards`) status from `PARTIAL` to `WORKING-VERIFIED` with resolution notes. |
| `audit/AUDIT-REPORT.md` | Modified | Updated Top 10 Finding 6 and "Don't demo this" items 6 & 7 to mark them resolved in Phase 2 with references. |

---

## 4. Before-and-After Scenarios

### Scenario 1: Missing Required Document Query
* **User Query:** *"Which required documents are missing?"*
* **Before:**
  * LLM generated prose citing `[E1]` and `[E2]`.
  * `documentId` was set to `''`.
  * Orchestrator filter `.filter((s) => s.documentId !== '')` dropped all gap cards.
  * API returned `{ grounded: true, sources: [] }`.
  * UI rendered zero source cards, leaving citation numbers unanchored.
* **After:**
  * Gaps are mapped to `factType: 'record.requirement'`, `documentName: 'Record Checklist: Operative Report'`, with `verbatimQuote: 'Required per Stage III Breast Checklist'`.
  * `attachHref` sets `href: '/patients/pt-101/record-map'`.
  * Filter keeps sources with valid `href`.
  * API returns `{ grounded: true, sources: [ { documentName: 'Record Checklist: Operative Report', href: '/patients/pt-101/record-map', ... } ] }`.
  * UI renders clickable source card directing user to the record map.
  * Invariant verified: `grounded === true` strictly implies `sources.length > 0`.

### Scenario 2: In-Processing Documents vs Definitively Missing
* **Scenario:** An uploaded Operative Report PDF is currently in status `ocr_running`.
* **Before:**
  * `evaluateGaps` saw no `confirmed` document for `document_type = 'operative_report'`.
  * Classified requirement as `status: 'missing'`.
  * Clinician was told the document was missing and prompted to request it.
* **After:**
  * `evaluateGaps` checks `ingestStatus`. If in `['received', 'rendering', 'ocr_running', 'classifying', 'extracting']`, it returns `status: 'partial'` with `candidateDocumentId`.
  * Clinician is truthfully informed the document was uploaded and is currently processing.

### Scenario 3: Uploaded Document with Zero Extracted Facts
* **Scenario:** A valid scanned document was uploaded and processed, but contained zero extractable oncology facts.
* **Before:**
  * `findDocument` searched `getTimeline()`. Having 0 facts, it was omitted.
  * `getCaseContext` reported `0 uploaded documents`.
  * User asking *"Did we receive the pathology report?"* was told *"No documents found"*.
* **After:**
  * `findDocument` checks `listDocuments` when timeline is empty.
  * Returns: `Found 1 uploaded document(s) for patient... Status: ready (0 facts extracted)`.
  * Gap evaluation treats confirmed document as satisfied (`status: 'satisfied'`).

### Scenario 4: Raw UUID and Storage Path Leakage
* **Scenario:** Assistant answers *"What was the biopsy date?"*.
* **Before:**
  * Prompt provided `(documentId=550e8400-e29b-41d4-a716-446655440000)`.
  * Assistant prose: *"According to documentId=550e8400-e29b-41d4-a716-446655440000, the biopsy date was 2025-04-12."*
* **After:**
  * Prompt provides clean label: `source: "Initial Pathology Report" | type: biopsy.date`.
  * System prompt instructs model never to emit raw UUIDs or internal IDs.
  * Orchestrator post-processor `sanitizeUserFacingProse` strips any accidental UUIDs, `documentId=...`, `id=...`, and storage URLs (`s3://`, `/api/v1/storage/...`).
  * Assistant prose: *"According to the Initial Pathology Report, the biopsy date was April 12, 2025."*

### Scenario 5: Conflicting and Rejected Evidence
* **Scenario:** Two documents state conflicting procedure dates, or an earlier fact was superseded.
* **Before:**
  * All ledger rows were fed into LLM without status distinction; LLM silently picked a date.
* **After:**
  * Conflicting rows are tagged `[CONFLICTING]`.
  * Superseded/rejected rows are tagged `[SUPERSEDED]` / `[REJECTED]`.
  * Assistant prompt instructs model to explicitly highlight unresolved disagreements rather than picking a single value.
  * `searchEvidence` prioritizes active verified facts over superseded ones.

---

## 5. Automated Verification Results

All tests were executed in the repository test environment:

| Suite / Gate | Command | Test Count | Result |
|---|---|---|---|
| Domain Tests | `pnpm --filter @oncobrief/domain test` | 306 passed (10 files) | **PASS** |
| Adapter Tests | `pnpm --filter @oncobrief/adapters test` | 24 passed (4 files) | **PASS** |
| Worker Tests | `pnpm --filter @oncobrief/worker test` | 26 passed (5 files) | **PASS** |
| Web Tests | `pnpm --filter @oncobrief/web test` | 95 passed (7 files) | **PASS** |
| Grounding Regression | `npx vitest run src/lib/assistant/grounding-regression.test.ts` | 14 passed (1 file) | **PASS** |
| TypeScript Check | `pnpm typecheck` | 6 projects checked | **PASS** (0 errors) |
| ESLint & Code Style | `pnpm lint:eslint` | All workspaces | **PASS** |
| Clinical Boundary Gate | `pnpm lint:clinical-boundary` | Domain & assistant scan | **PASS** |
| Branding Gate | `pnpm lint:branding` | Product vocabulary scan | **PASS** |
| Next.js Production Build | `pnpm --filter @oncobrief/web build` | 26 routes compiled | **PASS** (2.6s) |

### Regression Test Suite Breakdown (`grounding-regression.test.ts`)
1. Missing-required-document question returns truthful result with checklist requirement sources.
2. Invariant: A response marked `grounded: true` never has an empty `sources` list.
3. Every source reference resolves to a legitimate source or explicitly identified workflow requirement with valid `href`.
4. Missing document produces a checklist requirement citation linking to `/record-map`, never a fabricated document citation or page number.
5. In-processing document (`ocr_running`) evaluates to `partial`, not definitively missing.
6. Uploaded document with zero extracted facts is recognized by `findDocument` and satisfies checklist gap.
7. Unresolved conflicting evidence is annotated with `[CONFLICTING]` and prompt enforces explicit disagreement reporting.
8. Rejected or superseded evidence is annotated and not treated as active verified facts.
9. Raw UUIDs, `documentId=<uuid>`, and storage paths are stripped from user-facing assistant prose.
10. Grounding filter drops irrelevant sources without inflating the grounded response.
11. Insufficient evidence queries produce an honest response (`grounded: false`, `sources: []`).
12. Existing valid grounded answers continue to return valid document citations with page numbers.
13. Source links remain tenant-scoped to the active patient.
14. Missing-document gaps maintain stable identifiers and remain auditable across recomputation.

---

## 6. Verification Hierarchy

To ensure accuracy and transparency:
* **Local Unit and Integration Tests (VERIFIED):** All 451 unit and integration tests across `@oncobrief/domain`, `@oncobrief/adapters`, `@oncobrief/worker`, and `@oncobrief/web` pass.
* **CI Environment (PREPARED):** Phase 1 resolved the CI configuration conflict (`.github/workflows/ci.yml:31` vs `package.json:6`). All linters, typechecks, custom boundary gates, and tests pass in local CI equivalents.
* **Live Deployment Verification (DOCUMENTED):**
  * Local verification is complete.
  * Live deployment of these changes requires a standard rolling update of the `@oncobrief/web` container to AWS ECS.
  * No PostgreSQL migrations are required; database schemas are fully backward and forward compatible.
  * Deployed CloudFront/ECS instance verification can be confirmed following the next scheduled image rollout.

---

## 7. Schema Migration Analysis

* **Database Migration Required:** **None.**
* **Explanation:** All domain model extensions (`DocumentForGap.ingestStatus`, `DocumentForGap.factCount`) and assistant source types (`SourceCardData.documentId: string | null`) are backward-compatible. Database columns (`ingest_status`) already existed in the `document` table and are now actively projected during twin gap evaluation.

---

## 8. Remaining Limitations

1. **Local Worker Queue Loop:** As identified in the original audit, `pnpm dev:worker` in local development requires `QUEUE_DRIVER=sqs` with LocalStack or AWS due to the development environment check in `apps/worker/src/index.ts:26`. In-process document processing remains fully supported via server actions.
2. **Document Viewer Preview:** Direct document rendering in `/patients/[id]/sources/[documentId]` relies on OCR text span reconstruction when storage driver is local filesystem without an S3 presigned URL provider.
3. **LLM Provider Variance:** Under real external LLM providers (e.g. Bedrock / Anthropic / NVIDIA), model adherence to strict citation syntax (`[E1]`) is reinforced by our two-tier grounding validator (bracket matching with fallback keyword grounding) and `sanitizeUserFacingProse`, guaranteeing that even if a model outputs raw UUIDs, they are stripped before user rendering.
