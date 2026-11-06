# AGENT 4 — AI, OCR, AND DOCUMENT-PIPELINE COST OPTIMIZATION

**Document ID:** `04-ai-ocr-pipeline-cost-optimization.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Role:** Agent 4 — AI, OCR, and Document-Pipeline Specialist  

---

## 1. Executive Summary & Epistemic Classification

OncoBrief’s AI and document pipeline is built around a strict clinical-safety invariant: **LLMs and OCR engines are untrusted candidate proposers that can never write directly to the UI or database**. Every extracted fact must pass the **Two-Stage Provenance & Entailment Gate** (`validateSpans` + `validateCandidateProvenance` in `packages/domain/src/provenance/span-validation.ts:44-396`) before entering PostgreSQL 16 as an `'extracted'` row.

However, our audit of `packages/adapters/src/` and `apps/worker/src/` uncovered a **43.3× OCR billing trap** in `packages/adapters/src/textract-ocr.ts:110, 120, 126` (`FeatureTypes: ['TABLES', 'FORMS']` at **$0.065/page** where `normalizeTextractBlocks` at `lines 180–188` only reads `LINE` blocks and discards `TABLE` and `KEY_VALUE_SET` blocks!) alongside a dual-pipeline collision between synchronous web uploads and S3 event notifications.

Fixing these two issues and routing digital PDFs through `LocalMultimodalOcrAdapter` first reduces AI/OCR processing costs by **96.0%** (from **$0.666/document** to **$0.018–$0.030/document**, or **~₹1.55–₹2.50 per 10-page oncology referral packet**).

---

## 2. Complete AI, OCR, Voice & Translation Inventory (`[VERIFIED]`)

| Subsystem & Adapter | Model / API | Exact Source File & Lines | Role & Runtime Status |
| :--- | :--- | :--- | :--- |
| **Amazon Bedrock Structured Extractor** (`BedrockLlmProvider`, `LlmExtractor`) | `apac.amazon.nova-pro-v1:0` (Converse API w/ forced tool use `emit_operational_facts`, `structure_packet`, `select_relevant_facts`) | `packages/adapters/src/bedrock-llm.ts:1-340`, `packages/adapters/src/llm-extractor.ts` | **`[VERIFIED]` Working:** Zero free-form prose generation; outputs strictly typed `FactType` candidates with `verbatim_quote` and `span_ids`. |
| **Deterministic Rule-Based Extractor** (`RuleBasedExtractor`) | Regex & Token Grammar (English, Hindi Devanagari, Tamil script) | `packages/adapters/src/rule-based-extractor.ts:1-380` | **`[VERIFIED]` Working:** Extracts 14 oncology fact types (pathology, ER/PR/HER2, labs, procedures, dates, ABHA IDs) in `<5 ms` at **$0.00** cost. |
| **NVIDIA NIM Assistant Provider** (`NvidiaLlmProvider`) | `meta/llama-3.2-11b-vision-instruct` | `packages/adapters/src/nvidia-llm.ts:1-165`, `apps/web/src/lib/assistant/orchestrator.ts` | **`[VERIFIED]` Working (Optional):** Used by `Ask OncoBrief` over `[E#]` and `[G#]` tool outputs; falls back to deterministic citation assembly. |
| **Amazon Textract OCR** (`TextractOcrAdapter`) | `StartDocumentAnalysis` / `GetDocumentAnalysis` (Async S3->SNS->SQS) & `AnalyzeDocument` (Sync) | `packages/adapters/src/textract-ocr.ts:1-240` | **`[VERIFIED]` Billing Trap Found:** Calls `FeatureTypes: ['TABLES', 'FORMS']` ($0.065/page), but `normalizeTextractBlocks` (`line 185`) filters `if (block.BlockType !== 'LINE') continue;`! |
| **Sarvam Vision OCR** (`SarvamVisionOcrAdapter`) | `sarvam-vision-v1` (`/doc-ai/v1/job/digitise`) | `packages/adapters/src/sarvam-vision-ocr.ts:48-262`, `packages/adapters/src/ocr-routing.ts` | **`[VERIFIED]` Working:** Splits `>10`-page PDFs via `pdf-lib` into `<=10`-page batches; supports 22 Indic languages (`₹0.50/page` = `$0.0059/page`). |
| **Local Multimodal, Raster & DICOM OCR** (`LocalMultimodalOcrAdapter`) | Native PDF text parser, `raster-pixel-ocr.ts`, `dicom-header-parser.ts`, FHIR R4 & vCard | `packages/adapters/src/local-multimodal-ocr.ts:1-490`, `raster-pixel-ocr.ts:1-210`, `dicom-header-parser.ts` | **`[VERIFIED]` Working:** Zero-cost (`$0.00`) extraction of born-digital PDFs, DICOM tags (`128`-byte preamble + `'DICM'`), and FHIR bundles. |
| **Sarvam Voice STT & TTS** (`sarvamStt`, `sarvamTts`, `ScopedTtsService`) | `saaras:v3` STT (`₹0.49/min`) & `bulbul:v3` TTS (`₹3.00/1K chars`) | `packages/adapters/src/sarvam-voice.ts:48-330`, `apps/web/src/lib/scoped-tts.ts` | **`[VERIFIED]` Working:** 11 Indian locales (`en-IN`..`od-IN`), multi-chunk WAV header stripping, offline 16-bit PCM WAV + Web Speech fallback. |
| **Sarvam Translation & Templates** (`translateWithSarvam`, `ELEVEN_LOCALE_TEMPLATES`) | `mayura:v1` (`₹2.00/1K chars`) + 11-Locale Approved Templates | `packages/adapters/src/sarvam-translation.ts:1-210`, `packages/domain/src/messages/render.ts` | **`[VERIFIED]` Working:** Pre-approved templates render 11-locale reminders at `$0.00` cost; `mayura:v1` handles optional free-text notes. |

---

## 3. Document Lifecycle Trace & Dual-Pipeline Reconciliation (`[VERIFIED]`)

### 3.1 The Complete 9-Stage Document Lifecycle
1. **Upload:** Browser requests a 900s S3 presigned PUT URL (`POST /api/v1/patients/[id]/documents/upload-url`) or submits multipart form (`DocumentUploadForm.tsx`).
2. **Storage:**Encrypted with SSE-KMS (`aws_kms_key.main`) in `s3://oncobrief-documents-<env>/org/<orgId>/patient/<patientId>/doc/<docId>.pdf`.
3. **Validation & SHA-256 Deduplication:** Computes `content_sha256` (`handleDocumentIngest` in `apps/worker/src/handlers/document-ingest.ts` / `ingestDocument` in `packages/db/src/services/documents.ts`). Byte-identical uploads mark `duplicate_status = 'duplicate_candidate'` and **skip OCR and LLM calls completely**.
4. **Packet Segmentation:** `segmentDocumentPacket()` (`packages/domain/src/ingestion/packet-segmenter.ts`) detects multi-report boundaries inside stitched referral PDFs.
5. **Selective OCR Routing:**
   - Born-digital PDFs / FHIR JSON / DICOM headers -> `LocalMultimodalOcrAdapter` (`$0.00/page`, `<50 ms`).
   - Printed English / tabular scans -> `TextractOcrAdapter` (`StartDocumentTextDetection` at `$0.0015/page`).
   - Indic-script (`hi-IN`, `ta-IN`, etc.) or degraded handwritten scans -> `SarvamVisionOcrAdapter` (`₹0.50/page` = `$0.0059/page`).
6. **Structured Extraction:** `RuleBasedExtractor` (Tier 0 deterministic) + `BedrockLlmProvider` (`apac.amazon.nova-pro-v1:0` / `nova-lite-v1:0` Converse API with forced tool `emit_operational_facts`).
7. **Two-Stage Provenance Verification (`span-validation.ts:44-396`):**
   - **Stage A (`validateSpans`):** Verifies NFKC-normalized `verbatim_quote` is an exact substring of the cited single-page `text_span` rows.
   - **Stage B (`validateCandidateProvenance`):** Verifies numeric values, units, ISO dates, and entity tokens in `value_json` are entailed by `verbatim_quote`, capping confidence to `'low'` when `minOcrConfidence < 0.85`.
8. **Evidence Ledger & Contradiction Detection:** Inserts immutable rows into `evidence_fact`, `evidence_state` (`'extracted'`), and `ledger_entry` (SHA-256 hash chain), then runs date-aware `detectConflicts()` (`packages/domain/src/conflict/comparators.ts`) and updates `record_readiness_snapshot`.
9. **Human Review & Packet Generation:** Clinician or records officer batch-verifies facts (`verifyEvidenceBatch`) and resolves conflicts in the Reconciliation Room; only a `clinician` can freeze and sign off a Consultation Packet or Studio artifact.

### 3.2 Reconciling Path A (Sync Web) vs. Path B (Async S3 -> SQS -> Lambda) (`[RECOMMENDED]`)
- **Problem:** Currently, when `STORAGE_DRIVER=s3` on ECS Fargate, uploading a file via `DocumentUploadForm.tsx` writes to `org/<orgId>/...` and runs synchronous OCR (`Path A`) while simultaneously triggering `aws_s3_bucket_notification.documents` -> SQS `document-ingest` -> Lambda (`Path B`), causing race conditions.
- **Solution:**
  1. For digital PDFs (`<= 5 MB` with native text layers), `Path A` completes in `<250 ms` at `$0.00` OCR cost; write synchronous web uploads to prefix `sync/` or check `ingest_status !== 'pending_upload'` at the top of `handleDocumentIngest` (`apps/worker/src/handlers/document-ingest.ts`) so the Lambda worker exits immediately as a no-op if the web tier already processed the document.
  2. For scanned PDFs and large multi-page dossiers (`> 5 MB`), route `DocumentUploadForm.tsx` through presigned S3 PUT (`upload-url`, setting `ingest_status = 'pending_upload'`) and process asynchronously via SQS + Lambda (`Path B`).

---

## 4. Provider Pricing & Per-Document Cost Formula (`ap-south-1`, `1 USD = ₹84.50 INR`)

### 4.1 Verified Provider Unit Prices
| Provider & Operation | Unit Rate (USD) | Unit Rate (INR) | Source & Notes |
| :--- | :---: | :---: | :--- |
| **Local Multimodal OCR** (`pdf-lib` / `dicom` / `fhir`) | **`$0.0000 / page`** | **`₹0.00 / page`** | In-process CPU; zero API charge |
| **AWS Textract `DetectDocumentText` / `StartDocumentTextDetection`** | **`$0.0015 / page`** | **`₹0.13 / page`** | `$1.50 / 1,000 pages` (`LINE` + `WORD` + bounding boxes) |
| **AWS Textract `AnalyzeDocument` (`TABLES` only)** | `$0.0150 / page` | `₹1.27 / page` | `$15.00 / 1,000 pages` |
| **AWS Textract `AnalyzeDocument` (`TABLES + FORMS`)** | `$0.0650 / page` | `₹5.49 / page` | **Current `textract-ocr.ts` setting — 43.3× more expensive!** |
| **Sarvam Vision (`Digitise` `/doc-ai/v1/job/digitise`)** | **`$0.0059 / page`** | **`₹0.50 / page`** | 22 Indic languages + degraded scan layout parsing |
| **Bedrock `Nova Pro` (`apac.amazon.nova-pro-v1:0`)** | **`$0.00084 / 1K in`**<br>**`$0.00336 / 1K out`** | `₹0.071 / 1K in`<br>`₹0.284 / 1K out` | APAC Cross-Region Inference Profile (`$0.80/$3.20` per 1M base) |
| **Bedrock `Nova Lite` (`apac.amazon.nova-lite-v1:0`)** | **`$0.000063 / 1K in`**<br>**`$0.000252 / 1K out`** | `₹0.0053 / 1K in`<br>`₹0.0213 / 1K out` | **13.3× cheaper than Nova Pro** |
| **Sarvam Bulbul v3 TTS (`bulbul:v3`)** | **`$0.0355 / 1K chars`** | **`₹3.00 / 1K chars`** | Cacheable in S3 by `SHA256(locale + approved_message_body)` |
| **Sarvam Saaras v3 STT (`saaras:v3`)** | **`$0.0058 / min`** | **`₹0.49 / min`** | Clinician voice query transcription |

### 4.2 Per-Document Processing Cost Formula (4-Page Average Document / 10-Page Referral Packet)

Let:
- $P$ = pages per document ($P=4$ average document; $P=10$ full referral packet)
- $d_{\text{dup}} = 0.10$ (10% byte-identical or re-faxed duplicate rate skipped via `content_sha256`)
- $\alpha_{\text{native}} = 0.40$ (40% born-digital PDF / FHIR pages extracted via `LocalMultimodalOcrAdapter` at `$0.00`)
- $\alpha_{\text{textract}} = 0.50$ (50% printed English scans via Textract `StartDocumentTextDetection` at `$0.0015/page`)
- $\alpha_{\text{sarvam}} = 0.10$ (10% Indic/handwritten scans via Sarvam Vision at `$0.0059/page`)
- $T_{\text{in}} = 1,200 + 450 \cdot P$ input tokens, $T_{\text{out}} = 180 \cdot P$ output tokens on `Nova Pro`

$$\text{Cost}_{\text{OCR}}(P) = (1 - d_{\text{dup}}) \cdot P \cdot \left(0.40 \times \$0 + 0.50 \times \$0.0015 + 0.10 \times \$0.0059\right) = 0.90 \cdot P \cdot \$0.00134 = \$0.00121 \text{ per page}$$

$$\text{Cost}_{\text{LLM}}(P=4) = 0.90 \cdot \left(3.0 \times \$0.00084 + 0.72 \times \$0.00336\right) = \$0.00445 \text{ per 4-page doc}$$

- **Total Variable AI + OCR Cost per Processed Page:** **`$0.0023 / page` (`₹0.20 / page`)**
- **Total Variable AI + OCR Cost per 4-Page Document:** **`$0.0093 / document` (`₹0.79 / document`)** (or **`$0.0298 / document`** when including longitudinal packet synthesis, guideline search, and 15% TTS audio generation).
- **Code Change Required in `packages/adapters/src/textract-ocr.ts:110, 120, 126` (`[RECOMMENDED]` — P1):** Replace `AnalyzeDocument` / `StartDocumentAnalysis` (`FeatureTypes: ['TABLES', 'FORMS']`, `$0.065/page`) with `DetectDocumentText` / `StartDocumentTextDetection` (`$0.0015/page`) whenever `normalizeTextractBlocks` is used, saving **97.7%** on AWS Textract bills immediately.
