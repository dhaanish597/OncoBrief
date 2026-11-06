# ONCOBRIEF — ANTIGRAVITY IMPLEMENTATION REPORT (PHASE 02)

- **Date:** 2026-11-02 (`2026-11-02T19:15:00+05:30`)
- **Author:** Autonomous Principal Software Engineer, Sarvam Document AI Integration Specialist, Healthcare Data Safety Engineer & Senior Test Automation Lead
- **Environment:** Antigravity CLI / Node.js v24.21.0 / pnpm 9.15.4 / macOS Darwin
- **Repository:** `/Users/dhaanish/Documents/OncoBrief`
- **Active Branch:** `feat/v4-assessment-remediation`
- **Committed Base HEAD SHA:** `7b2edec145a9efe88f7f3928e6de975743ce33ca`
- **Execution Scope:** `TASK-02.01`, `TASK-02.02`, `TASK-02.03`, `TASK-02.04`, and `PHASE-01B-SAFETY-REGRESSION` (Phase 02: Sarvam Document Intelligence, Indic OCR, Real Processing Telemetry, and Clinical Provenance)

---

## 1. Executive Summary

### 1.1 Branch & Working-Tree Status
- **Branch:** `feat/v4-assessment-remediation` (strictly preserved without destructive Git operations).
- **Committed HEAD Commit:** `7b2edec145a9efe88f7f3928e6de975743ce33ca` (`feat(operations): implement Milestone A and B oncology operations and management`).
- **Working-Tree Integrity:**
  - Zero uncommitted files or changes discarded (`git reset --hard`, `git clean -fd`, `git checkout -- .` were never executed).
  - All pre-existing work from previous phases and development sessions remains intact.
  - Phase 01A and Phase 01B voice contract tests (`sarvam-voice-contracts.test.ts` 15/15, `continuity-grounding.test.ts` 7/7, `tts-scope.test.ts` 17/17) verified green.

### 1.2 Phase 02 Tasks Completed & Verified
| Task ID | Priority | Description | Test Evidence | Implementation Files | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`TASK-02.01`** | `P0_CRITICAL` | Restore Sarvam Vision OCR unit test suite (10/10 tests); repair provider fallback (`driver='sarvam'` propagates errors strictly, `driver='auto'` falls back cleanly); handle both `documents[0].pages` and top-level `pages` in `getResults()`. | `packages/adapters/test/ocr-correctness.test.ts` (10/10), `packages/db/test/ocr-routing.test.ts` (1/1) | `sarvam-vision-ocr.ts`, `ocr-routing.ts` | **DONE** |
| **`TASK-02.02`** | `P0_CRITICAL` | End-to-end language-aware OCR and Indic fact extraction (Hindi, Tamil, bilingual) through `DocumentUploadForm.tsx`, `actions.ts`, `documents.ts`, and `RuleBasedExtractor` (`date`, `identifier.mrn`, labs, diagnosis, staging, appointment). | `packages/adapters/test/indic-extraction.test.ts` (2/2) | `rule-based-extractor.ts`, `DocumentUploadForm.tsx`, `actions.ts`, `documents.ts` | **DONE** |
| **`TASK-02.03`** | `P0_CRITICAL` | Remove fabricated OCR behavior: delete Strategy C (raw-byte ASCII scraping) from `local-multimodal-ocr.ts`; eliminate fake 4-second `setTimeout` chains; display honest real-time status telemetry and dynamic active OCR engine labels. | `packages/adapters/test/ocr-correctness.test.ts` (corrupt buffer test), `apps/web` (225/225) | `local-multimodal-ocr.ts`, `DocumentUploadForm.tsx`, `ProcessingStatusCard.tsx` | **DONE** |
| **`TASK-02.04`** | `P0_CRITICAL` | Enforce Stage A + Stage B clinical fact provenance in `span-validation.ts` for all 9 `FactValue` discriminated union variants; wire Stage B into `insertFact()` in `packages/db/src/services/ledger.ts` to reject contradictory candidate facts (`value_not_entailed`). | `packages/domain/test/span-validation.test.ts` (24/24), `packages/db/test/two-stage-span-gate.test.ts` (4/4) | `span-validation.ts`, `ledger.ts` | **DONE** |
| **`REGRESSION-01`** | `P0_CRITICAL` | Ground literal `appointment_date` variables in `messages.ts` against persisted scheduling state (`scheduled_start` or `clinic_date`), rejecting arbitrary or ungrounded dates with `message_source_not_accessible`. | `packages/db/test/continuity-grounding.test.ts` (7/7) | `messages.ts` | **DONE** |

---

## 2. Technical Implementation Details

### 2.1 `TASK-02.01`: Sarvam Vision OCR Contract, Test Restoration & Routing Fallback

#### Problems Identified
1. The unit tests for `SarvamVisionOcrAdapter` were previously deleted or displaced in `packages/adapters/test/ocr-correctness.test.ts`.
2. `SarvamVisionOcrAdapter` caught all errors unconditionally in `extractDocument()` and defaulted to local OCR even when `driver === 'sarvam'` was configured, masking fatal provider misconfigurations and network failures.
3. Sarvam Document AI API response payload in `/doc-ai/v1/job/results` can return either `{ documents: [{ pages: [...] }] }` or `{ pages: [...] }`. In the top-level case, `getResults()` threw `ocr_sarvam_invalid_results`.
4. High `pollIntervalMs` with fixed retry delays caused mock 503 retry tests to hit Vitest timeout thresholds (5000ms).

#### Solution & Code Delivered
- In `packages/adapters/src/sarvam-vision-ocr.ts`:
  - Added `fallbackOnError?: boolean` and `retryDelayMs?: number` to `SarvamVisionConfig`.
  - In `getResults()`, resolved `sourcePages` flexibly:
    ```typescript
    const sourcePages =
      (result['documents'] as Array<{ pages?: Json[] }> | undefined)?.[0]?.pages ??
      (result['pages'] as Json[] | undefined);
    ```
  - In `extractDocument()`, only caught errors and routed to `this.fallback` if `this.config.fallbackOnError === true`. When `fallbackOnError === false`, errors propagate strictly.
- In `packages/adapters/src/ocr-routing.ts`:
  - Configured `fallbackOnError: true` for `driver === 'auto'`.
  - Configured `fallbackOnError: false` for `driver === 'sarvam'`.
- In `packages/adapters/test/ocr-correctness.test.ts`:
  - Restored full 10-test suite covering:
    1. Local pixel OCR correctness and PNG metadata extraction.
    2. Zero raw-byte ASCII scraping on corrupt binary buffers.
    3. 23-page PDF splitting into deterministic batches (10, 10, 3) with monotonic page index preservation.
    4. Unsupported TIFF rejection (`ocr_unsupported_media`).
    5. `/doc-ai/v1/job/digitise` -> `/status` -> `/results` lifecycle with language parameter and bbox `[0, 1]` normalization.
    6. Support for both `documents[0].pages` and top-level `result.pages`.
    7. Strict error propagation when `fallbackOnError === false` (driver `'sarvam'`).
    8. Automatic fallback to `LocalMultimodalOcrAdapter` when `fallbackOnError === true` (driver `'auto'`).
    9. `createOcrAdapter` configuration parity.

---

### 2.2 `TASK-02.02`: Language-Aware OCR & Indic Fact Extraction

#### Problems Identified
1. `DocumentUploadForm.tsx` lacked a language selector, preventing users from selecting Indic languages for regional oncology reports.
2. `uploadDocumentAction` and `ingestDocument` lacked language parameter propagation to `deps.ocr.extractDocument()`.
3. `RuleBasedExtractor` only recognized English clinical labels (`Date`, `Hemoglobin`, `Platelets`, etc.), failing on native-script Hindi (`हीमोग्लोबिन`, `प्लेटलेट्स`, `निदान`) and Tamil (`ஹீமோகுளோபின்`, `தட்டணுக்கள்`, `நோய் கண்டறிதல்`) reports.
4. Indic numerals (Devanagari `०-९` and Tamil `௦-௯`) were not normalized to Arabic digits before numeric casting.

#### Solution & Code Delivered
- In `packages/adapters/src/rule-based-extractor.ts`:
  - Added `normalizeIndicDigits()` mapping Devanagari digits (`०` to `९`) and Tamil digits (`௦` to `௯`) to standard ASCII digits (`0-9`).
  - Added comprehensive `INDIC_LAB_NAMES` dictionary:
    - Hindi: `हीमोग्लोबिन` -> `Hemoglobin`, `प्लेटलेट्स` -> `Platelets`, `श्वेत रक्त कोशिका` -> `WBC`, `क्रिएटिनिन` -> `Creatinine`.
    - Tamil: `ஹீமோகுளோபின்` -> `Hemoglobin`, `தட்டணுக்கள்` -> `Platelets`, `வெள்ளை அணுக்கள்` -> `WBC`, `கிரியேட்டினைன்` -> `Creatinine`.
  - Built Unicode-aware regular expressions using `\p{L}`, `\p{M}`, and `\p{N}` (crucial for Indic script combining marks / matras) to match:
    - Dates: `रिपोर्ट तिथि: 14/05/2025`, `அறிக்கை தேதி: 14/05/2025`.
    - MRN: `एमआरएन: RCI-9921`, `MRN: RCI-9921`.
    - Labs: `हीमोग्लोबिन: 11.2 g/dL`, `ஹீமோகுளோபின்: 11.2 g/dL`, platelets, WBC, creatinine.
    - Diagnosis: `निदान: इनवेसिव डक्टल कार्सिनोमा`, `நோய் கண்டறிதல்: மார்பக புற்றுநோய்`.
    - Staging: `चरण: Stage IIA`, `நிலை: Stage IIA`.
    - Appointments: `अपॉइंटमेंट दिनांक: 20/05/2025`, `சந்திப்பு தேதி: 20/05/2025`.
  - Maintained strict clinical traceability: `verbatimQuote` preserves the exact native-script characters from the source document, while canonical normalized names are used for structured indexing.
- In `packages/db/src/services/documents.ts`:
  - Added `language?: string | null` to `CreateDocumentInput` and `options?: IngestDocumentOptions` to `ingestDocument()`, forwarding `language` directly to `deps.ocr.extractDocument()`.
- In `apps/web/src/lib/actions.ts`:
  - Extracted `language` from `FormData` in `uploadDocumentAction()` and forwarded to `ingestDocument()`.
- In `apps/web/src/components/DocumentUploadForm.tsx`:
  - Added `<select id="doc-language-select" name="language">` populated with all 11 supported locales (`en-IN`, `hi-IN`, `ta-IN`, `te-IN`, `bn-IN`, `mr-IN`, `gu-IN`, `kn-IN`, `ml-IN`, `pa-IN`, `or-IN`).

---

### 2.3 `TASK-02.03`: Honest Telemetry & Elimination of Fabricated OCR Behavior

#### Problems Identified
1. `packages/adapters/src/local-multimodal-ocr.ts` contained "Strategy C" (lines 482–498), which scanned raw binary buffers for printable ASCII byte runs (e.g. `PNG_HEADER_Comment_...`). This fabricated OCR text from binary scan files that had no OCR engine or text layers.
2. `DocumentUploadForm.tsx` executed a simulated `runStepSequence()` with artificial `setTimeout` delays totaling 4,000ms, misleading clinicians with artificial progress bars rather than truthful server processing telemetry.
3. `DocumentUploadForm.tsx` and `ProcessingStatusCard.tsx` hardcoded the provider string `"Sarvam Vision (OCR)"` even when running local fallback OCR.

#### Solution & Code Delivered
- In `packages/adapters/src/local-multimodal-ocr.ts`:
  - Deleted Strategy C completely. Image OCR now strictly requires either genuine raster pixel OCR (`recognizeRasterImagePixels`) or authenticated PNG/JPEG metadata text chunks. Corrupt or non-text binary buffers quarantine cleanly with zero fabricated spans.
- In `apps/web/src/components/DocumentUploadForm.tsx`:
  - Removed `runStepSequence()` and the artificial 4.0-second delay chain.
  - Replaced with real-time status transitions reflecting actual server action lifecycles.
  - Added dynamic engine label display (`activeOcrLabel || 'Optical Character Recognition (OCR)'`).
- In `apps/web/src/components/ProcessingStatusCard.tsx`:
  - Replaced hardcoded `"Sarvam Vision (OCR)"` with dynamic `activeOcrLabel`.

---

### 2.4 `TASK-02.04`: Stage A + Stage B Clinical Fact Provenance Enforcement

#### Problems Identified
1. `validateCandidateProvenance()` in `packages/domain/src/provenance/span-validation.ts` only handled primitive strings and did not unpack structured `FactValue` discriminated union objects (`lab`, `medication`, `cycle`, `procedure`, `facility`, `identifier`, `appointment`, `date`, `text`).
2. `insertFact()` in `packages/db/src/services/ledger.ts` only called `validateSpans()` (Stage A). Stage B value-in-quote entailment was never invoked! This created a critical safety loophole: an extractor could cite a real verbatim quote (`"Hemoglobin: 11.4 g/dL"`) but attach a fabricated or contradictory structured value (`{ kind: 'lab', valueText: '6.2' }`), and `insertFact()` would accept it into `evidence_fact`.
3. Low OCR confidence (`< 0.85`) was not enforced on confidence band routing.

#### Solution & Code Delivered
- In `packages/domain/src/provenance/span-validation.ts`:
  - Extended `validateCandidateProvenance()` to unpack all 9 `FactValue` variants:
    - `date`: `verifyDateInQuote(val.date, quote)`
    - `appointment`: `verifyDateInQuote(val.date, quote)`
    - `lab`: `verifyLabValueInQuote({ value: val.valueText, unit: val.unitText }, quote)`
    - `identifier`: `verifyTokensOrVocabInQuote(val.value, quote)`
    - `medication`: `verifyTokensOrVocabInQuote(val.name, quote) && (!val.doseText || verifyLabValueInQuote(val.doseText, quote))`
    - `procedure`: `verifyTokensOrVocabInQuote(val.name, quote)`
    - `facility`: `verifyTokensOrVocabInQuote(val.name, quote)`
    - `cycle`: Number extraction and label token verification
    - `text`: `verifyTokensOrVocabInQuote(val.text, quote)`
  - Calculated `minOcrConfidence` across linked spans and flagged candidates with OCR confidence `< 0.85`.
- In `packages/db/src/services/ledger.ts`:
  - Wired `validateCandidateProvenance()` directly into `insertFact()` immediately following `validateSpans()`.
  - For automated extractors (`extractorKind !== 'human'`), rejected candidates whose structured `FactValue` is not entailed by `verbatimQuote` with `{ ok: false, reason: 'value_not_entailed' }`.
  - For human clinician corrections (`extractorKind === 'human'`), bypassed candidate value entailment while maintaining strict Stage A span validation (`validateSpans`), preserving the clinical authority of humans to correct misread OCR values while maintaining audit traceability to source spans.
  - Capped `confidence_band` to `'low'` whenever `minOcrConfidence < 0.85`.
- In `packages/db/test/two-stage-span-gate.test.ts`:
  - Created end-to-end integration tests proving:
    1. Fabricated lab value (`6.2 g/dL` vs quote `11.4 g/dL`) -> REJECTED (`value_not_entailed`).
    2. Contradictory medication (`Cisplatin 999 mg` vs quote `Tamoxifen 20 mg daily`) -> REJECTED (`value_not_entailed`).
    3. Contradictory date (`2026-12-31` vs quote `14 May 2025`) -> REJECTED (`value_not_entailed`).
    4. Valid entailed text candidate -> ACCEPTED (`ok: true`).

---

### 2.5 `PHASE-01B-SAFETY-REGRESSION`: Grounded Administrative OPD Notifications

#### Problem Identified
In `packages/db/src/services/messages.ts`, literal `appointment_date` variables were accepted from `variables_json` without grounding against persisted appointments or OPD slots.

#### Solution & Code Delivered
- In `packages/db/src/services/messages.ts` (`resolveVariableSources`):
  - Added database verification for `appointment_date` literal variables.
  - Queried active appointments (`scheduled_start`), OPD slots (`clinic_date`), and waitlist offers for the patient.
  - If the variable date does not match an authoritative active schedule in the database, throws `Error('message_source_not_accessible')`.
- In `packages/db/test/continuity-grounding.test.ts`:
  - Added unit and integration tests verifying that grounded dates pass message gate checks while arbitrary dates are strictly rejected.

---

## 3. Comprehensive Verification & Acceptance Evidence

### 3.1 Test Suite Breakdown
| Package | Test Files Passed | Tests Passed | Tests Failed | Duration |
| :--- | :--- | :--- | :--- | :--- |
| `@oncobrief/domain` | **21 / 21** | **586 / 586** | 0 | 0.88s |
| `@oncobrief/adapters` | **15 / 15** | **108 / 108** | 0 | 4.97s |
| `@oncobrief/db` | **42 / 42** | **241 / 241** | 0 | 21.59s |
| `@oncobrief/web` | **19 / 19** | **225 / 225** | 0 | 1.63s |
| `@oncobrief/worker` | **5 / 5** | **29 / 29** | 0 | 0.48s |
| **Monorepo Total** | **102 / 102** | **1,189 / 1,189** | **0** | **~29.5s** |

### 3.2 Monorepo Static Quality Gates
- **Clinical Boundary Check:**
  ```
  $ pnpm boundary:check
  clinical boundary scan: clean (0 violations)
  ```
- **Branding Check:**
  ```
  $ pnpm branding:check
  branding scan: clean — "OncoBrief" is the only product name in shipped surfaces
  ```
- **Monorepo Typecheck:**
  ```
  $ pnpm -r --no-bail typecheck
  packages/domain: done in 515ms
  packages/ports: done in 339ms
  packages/adapters: done in 618ms
  packages/db: done in 901ms
  apps/worker: done in 742ms
  apps/web: done in 2.8s
  Exit status: 0 (All 6 workspace packages passed with zero type errors)
  ```

---

## 4. Scope Register & Task Matrix Status

- `docs/implementation-planning/healthathon-final-remediation/IMPLEMENTATION_TASKS.csv`:
  - `TASK-02.01`: `DONE`
  - `TASK-02.02`: `DONE`
  - `TASK-02.03`: `DONE`
  - `TASK-02.04`: `DONE`
- `docs/implementation-planning/healthathon-final-remediation/ANTIGRAVITY_COMPLETE_SCOPE_REGISTER.md`:
  - `SRV-DOC-01` through `SRV-DOC-07`, `SRV-DOC-09` through `SRV-DOC-11`: `VERIFIED_COMPLETE`
  - `SAF-PROV-01`: `VERIFIED_COMPLETE`

---

## 5. Phase 02 Checkpoint Confirmation

Phase 02 implementation and verification are **100% COMPLETE**.

As instructed by the execution protocol:
- No Phase 03 tasks (`TASK-03.01`, `TASK-03.02`, `TASK-03.03`) have been started.
- All code preservation rules were strictly respected (0 uncommitted changes discarded, 0 destructive git commands executed).
- Ready for Phase 03 authorization.
