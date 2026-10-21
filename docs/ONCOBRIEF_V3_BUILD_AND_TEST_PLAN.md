#  ONCOBRIEF_V3_BUILD_AND_TEST_PLAN.md

Target Repository: [https://github.com/dhaanish597/OncoBrief](https://github.com/dhaanish597/OncoBrief) (Base Commit: 58280d8)
Track & Mandate: Health-a-thon 2026 Cancer Care Track (IIT Bombay KCDH, Koita Foundation, NCG-KCDO, Sarvam AI, OpenAI)
Monorepo Toolchain: pnpm@9.15.4, Next.js App Router (apps/web), Async Worker (apps/worker), PostgreSQL 16 + RLS (packages/db), Pure Domain (packages/domain), Multi-Modal Adapters (packages/adapters)
Execution Agent Instructions (Antigravity): Execute every phase in strict sequential order. Enforce no-explicit-any and noUncheckedIndexedAccess across all TypeScript files. Do not advance to the next phase until all unit, integration, API smoke, and clinical-boundary verification commands for the current phase pass with zero errors.

1. Strategic Architecture & Non-Negotiable Guardrails

1.1 Why OncoBrief Uses a Universal Boundary-Artifact Adapter

External clinical coordination platforms cannot achieve scalable deployment by building direct point-to-point API integrations with proprietary third-party Hospital Management Information Systems (HMIS) or Electronic Medical Records (EMRs):

⚬ Hospital Vendor Fragmentation: Across the National Cancer Grid (NCG)—spanning 370+ cancer hospitals treating over 60% of India’s cancer patients—the Koita Centre for Digital Oncology (NCG-KCDO) Leading EMR Adopter Program (LEAP) empaneled six separate commercial EMR vendors (Amrita Technologies, Oakland Systems/Mednet Labs, Plus91 Technologies, Ohum Healthcare Solutions, Manorama Infosolutions, and TrioTree Technologies) just to support ~20 early-adopter centers, while hundreds of other institutions use legacy databases or paper charts.
⚬ Closed Commercial Silos & Firewalls: Proprietary EMR vendors do not expose open APIs without custom enterprise contracts, and hospital IT firewalls block external database queries to maintain compliance with the Digital Personal Data Protection (DPDP) Act.
⚬ 60-to-90-Day Clinical Deployment Window: Health-a-thon 2026 requires solutions that integrate seamlessly into existing hospital workflows and prove measurable operational impact within 60 to 90 days.

Architectural Solution: Instead of integrating with locked internal hospital software, OncoBrief ingests the five universal clinical boundary artifacts that every hospital, laboratory, and imaging center already produces at patient touchpoints:

1. Multi-Report Scanned PDFs & Smartphone Photos: Unorganized outside medical record packets containing stitched discharge summaries, outpatient department (OPD) notes, referral letters, and pathology reports.
2. Digital-Native & Scanned Tabular Laboratory Reports: Serial blood panels, biochemistry flowsheets, and tumor marker tables where test names, numeric values, units, and reference ranges must remain row-aligned.
3. Medical Imaging Archives (DICOM) & Genomic/Pathology Headers: Patient CD/USB/ZIP imaging files (DICM binary headers) and VCF/HL7 headers.
4. Multilingual & Code-Mixed Clinical/Patient Audio: Voice dictations and symptom check-ins across 22 Indian languages and English.
5. Standards-Based Health Exchange Payloads: HL7 FHIR R4 bundles, including NRCeS ABDM v6.5.0 DocumentBundle profiles and HL7 mCODE STU4 oncology profiles.

1.2 Non-Negotiable Compliance Guardrails (clinical-boundary.ts)

⚬ Strictly Assistive & Non-Clinical: OncoBrief is an oncology record-readiness and care-continuity platform, NOT a clinical decision support (CDS), risk-scoring, or diagnostic system. The codebase must never infer TNM staging, RECIST progression, clinical trial medical eligibility, biomarker interpretation, or autonomous symptom triage.
⚬ Non-Interpretive Multi-Modal Intake: For DICOM files, pathology slide metadata, and VCF files, extract only explicitly documented administrative and provenance metadata (Modality, StudyDate, StudyInstanceUID, series count, issuing facility, stated document date, page count, SHA-256 hash) without interpreting medical images or genomic variants.
⚬ No Silent Contradiction Resolution: If two outside records state conflicting dates, histologies, or lab values, the pipeline must never allow an LLM to silently pick a winner or merge them. Both facts must be stored linked to their respective source spans and flagged as conflicting for clinician review.
⚬ Explicit Separation of FHIR R4 / mCODE STU4 and ABDM v6.5.0: HL7 mCODE STU4 is a US-realm oncology profile set on FHIR R4, whereas NRCeS ABDM v6.5.0 is India’s national health exchange specification. OncoBrief stores normalized entities in a typed intermediate PostgreSQL ledger first (document \rightarrow document_page \rightarrow text_span \rightarrow evidence_fact), then projects verified records into distinct mCODE STU4 or ABDM v6.5.0 bundles.

2. End-to-End Pipeline Architecture & Literature Grounding

[Client Upload / API Intake] (PDF, PNG/JPG/TIFF/WebP, FHIR JSON, DICOM .dcm, VCF/HL7, Audio)
       │
       ▼
STAGE 1: Triage, Security & Pre-Processing Gateway
  ├── Auth (resolveApiCaller) + RBAC (document:upload / document:read_page)
  ├── Bounded 25 MB Stream Guard + SHA-256 Digest + Near-Duplicate Detection
  ├── Format Normalization: TIFF/WebP -> PNG/PDF (prevents Sarvam HTTP 415)
  ├── Batch Splitter: Splits PDFs >10 pages into <=10-page chunks with global page offset
  └── DICOM PHI Scrubber: Pseudonymizes Group 0010 tags & checks BurnedInAnnotation (0028,0301)
       │
       ▼
STAGE 2: Multi-Modal Non-Interpretive Layout & Header Ingestion
  ├── Track A (Sarvam Vision doc_ai / Local PDF Fallback): Extracts reading-order text,
  │           row-aligned lab tables, and normalized [0..1] bbox into immutable `text_span` rows
  ├── Track B (Packet Segmenter - Damani et al. 2026): Splits multi-report PDFs into virtual
  │           sub-documents (Pathology, Lab, Imaging, Discharge, OPD, Prescription, Billing) + Dates
  ├── Track C (DICOM / VCF / FHIR Header Parser): Emits administrative metadata as `text_span` rows
  └── Track D (Sarvam Saaras V4 ASR): Transcribes multilingual audio into grounded `text_span` rows
       │
       ▼
STAGE 3: Candidate Extraction & Two-Stage Deterministic Safety Gate
  ├── Rule & Constrained LLM Extractors propose candidate facts with `spanIds` + `verbatimQuote`
  ├── STAGE A GATE: Verifies `verbatimQuote` is an exact contiguous substring of `text_span`s
  ├── STAGE B GATE: Verifies extracted `value` (ISO/localized date, numeric lab + unit, facility
  │                 tokens, or vocab synonym) is deterministically entailed inside `verbatimQuote`
  ├── Confidence Router: Routes valid candidates with `ocr_confidence < 0.85` to `needs_review`
  └── Conflict Detector: Flags cross-document disagreements as `conflicting` (no silent overwrite)
       │
       ▼
STAGE 4: Split-Screen Provenance Inspector & Standards Export
  ├── Unified `SourcePaneView.tsx`: Toggle between "Original Scan + SVG BBox Overlay" & "OCR Text"
  ├── 6-State HITL Ledger: `extracted` | `needs_review` | `conflicting` | `verified` | `corrected` | `rejected`
  └── Standards Mapper: Exports verified ledger to NRCeS ABDM v6.5.0 DocumentBundle or HL7 mCODE STU4


Literature-Backed Engineering Requirements

1. Multi-Report Packet Segmentation (Damani et al., 2026): Automatically segment multi-report outside PDFs into sub-documents, classify report category, and extract stated report dates.
2. Typed Intermediate Ledger Before Summaries or FHIR (Wiest et al., 2025; Gazzarata et al., 2024; Amar et al., 2024): Normalize heterogeneous formats into typed intermediate database records before generating timelines or FHIR bundles.
3. Tabular Lab Row Integrity (Ma et al., 2023; Li et al., 2024): Preserve horizontal row associations in scanned lab reports so numeric values are never divorced from their test name, unit, and reference range.
4. Two-Stage Grounding & Omission/Commission Safety (Asgari et al., 2025; Huang et al., 2024; Gero et al., 2023; google/langextract): Enforce span grounding plus deterministic value-in-quote verification, and route low-confidence extractions to human review.

3. Phased Implementation Plan (File-by-File Specifications)

PHASE 1: Storage Security, RBAC Enforcement, Upload Guardrails & Immutable Spans

Task 1.1: Make text_span Append-Only in PostgreSQL

⚬ File to Create: packages/db/migrations/0008_lock_text_spans.sql
⚬ Problem Fixed: Audit Defect #5 (0003_policies_grants.sql leaves UPDATE and DELETE grants on text_span for oncobrief_app).
⚬ Implementation Requirements:
  1. Revoke UPDATE, DELETE, and TRUNCATE on text_span from oncobrief_app; keep SELECT, INSERT.
  2. Create PL/pgSQL function prevent_text_span_mutation() and trigger trg_text_span_immutable (BEFORE UPDATE OR DELETE ON text_span FOR EACH ROW) raising SQLSTATE 42501 on any UPDATE, and on any DELETE where the parent document_page row still exists.

Task 1.2: Implement Presigned Local Storage Streaming Route & Fix evidence/[id]

⚬ Files to Create/Modify:
  ⚬ Create apps/web/src/app/api/v1/storage/local/route.ts
  ⚬ Modify packages/adapters/src/local-fs-storage.ts
  ⚬ Modify packages/adapters/src/index.ts
  ⚬ Modify apps/web/src/app/api/v1/evidence/[id]/route.ts
⚬ Problem Fixed: Audit Defect #1 (LocalFsStorageAdapter generates /api/v1/storage/local?... URLs that 404, and evidence/[id]/route.ts:45 swallows the error with documentUrl = null).
⚬ Implementation Requirements:
  1. Export verifyPresign from packages/adapters/src/local-fs-storage.ts and re-export it from packages/adapters/src/index.ts.
  2. In apps/web/src/app/api/v1/storage/local/route.ts (GET):
    ⚬ Authenticate via resolveApiCaller(request) \rightarrow return 401 if unauthenticated.
    ⚬ Authorize via can(caller.role, 'document:read_page') \rightarrow return 403 if unauthorized.
    ⚬ Validate query params key, expires (or exp), and sig \rightarrow return 400 if missing/malformed.
    ⚬ Verify signature and expiry via verifyPresign \rightarrow return 403 if invalid or expired.
    ⚬ Resolve key against the local storage root directory and reject path traversal (relativePath.startsWith('..') or path.isAbsolute(relativePath)) with 403.
    ⚬ Stream the file via Readable.toWeb(createReadStream(resolvedFilePath)) with Content-Type (application/pdf, image/png, image/jpeg, image/tiff, image/webp, application/fhir+json, application/dicom, text/plain), Content-Length, and X-Content-Type-Options: nosniff.
  3. In apps/web/src/app/api/v1/evidence/[id]/route.ts, ensure documentUrl is populated via the storage adapter’s presigned download URL for both fs and s3 drivers.

Task 1.3: Fix Validation Ordering in upload-url/route.ts

⚬ File to Modify: apps/web/src/app/api/v1/patients/[id]/documents/upload-url/route.ts
⚬ Problem Fixed: Audit Defect #2 (upload-url/route.ts:36-45 returns 501 for STORAGE_DRIVER=fs before validating auth, RBAC, patient UUID, JSON body, MIME type, or 25 MB size cap, failing 4/11 pnpm smoke:api tests).
⚬ Implementation Requirements:
  Execute validations in this exact order before checking STORAGE_DRIVER:
  1. resolveApiCaller(request) \rightarrow 401 UNAUTHORIZED if null.
  2. can(caller.role, 'document:upload') \rightarrow 403 FORBIDDEN if false.
  3. Validate params.id is a valid UUID \rightarrow 400 BAD_REQUEST if invalid.
  4. Parse await request.json() inside try/catch and verify non-null object \rightarrow 400 INVALID_JSON if malformed.
  5. Validate filename / fileName (non-empty string, \le 255 chars) \rightarrow 400 VALIDATION_ERROR.
  6. Validate contentType / mimeType against the non-interpretive intake allowlist (application/pdf, image/png, image/jpeg, image/tiff, image/webp, application/fhir+json, application/json, application/dicom, text/plain, text/vcard) \rightarrow 400 UNSUPPORTED_MEDIA_TYPE.
  7. Validate sizeBytes / byteSize (> 0 and \le 25 \times 1024 \times 1024 bytes) \rightarrow 400 if \le 0, 413 PAYLOAD_TOO_LARGE if > 26,214,400.
  8. Only after Steps 1–7 pass: If STORAGE_DRIVER === 'fs', return 501 NOT_IMPLEMENTED; otherwise return 200 OK with the S3 presigned upload URL.

Task 1.4: Enforce resolveApiCaller & document:read_page on Document Pages Route

⚬ File to Modify: apps/web/src/app/api/v1/patients/[id]/documents/[documentId]/pages/[n]/route.ts
⚬ Problem Fixed: Audit Defect #3 (Uses cookie-only getSession and omits can(caller.role, 'document:read_page')).
⚬ Implementation Requirements:
  1. Replace getSession with resolveApiCaller(request) (401 if null).
  2. Enforce can(caller.role, 'document:read_page') (403 if false).
  3. Validate 1-indexed page number n (400 if <1 or non-integer).
  4. Return documentUrl (presigned read URL) alongside pageNumber, width, height, mimeType, and spans.

Task 1.5: Add Bounded 25 MB Streaming Upload Guard in actions.ts

⚬ File to Modify: apps/web/src/lib/actions.ts
⚬ Problem Fixed: Audit Defect #2 (actions.ts:260-261 buffers entire file in memory via file.arrayBuffer() with no size ceiling).
⚬ Implementation Requirements:
  1. Implement readBoundedUploadFile(file: File, maxBytes = 25 * 1024 * 1024): Promise<Buffer> using file.stream().getReader().
  2. Check file.size > maxBytes upfront AND increment totalBytes on every stream chunk, canceling the stream and throwing UPLOAD_TOO_LARGE immediately if totalBytes > maxBytes.

PHASE 2: Multi-Modal Non-Interpretive Intake, Packet Segmentation & Layout OCR

Task 2.1: Wire OCR_DRIVER & Fix Worker Polling Loop

⚬ Files to Modify:
  ⚬ packages/db/src/env.ts
  ⚬ apps/worker/src/config.ts
  ⚬ apps/worker/src/ports.ts
  ⚬ apps/worker/src/index.ts
⚬ Problem Fixed: Audit Defect #4 (OCR_DRIVER ignored; apps/worker/src/index.ts:26-30 exits with code 2 when QUEUE_DRIVER=memory; poll() recreates config/queue/logger on every tick).
⚬ Implementation Requirements:
  1. Add OCR_DRIVER: z.enum(['auto', 'sarvam', 'textract', 'local-pdf', 'fixture']).default('auto') and SARVAM_API_KEY: z.string().optional() to env.ts and config.ts.
  2. In apps/worker/src/index.ts, allow QUEUE_DRIVER=memory in non-production environments with a structured startup warning instead of process.exit(2). Hoist loadConfig(), createLogger(), createQueue(), and createPorts() outside the poll() loop so instances are reused across polling ticks.

Task 2.2: Non-Interpretive DICOM Header & Multi-Modal Fallback Adapters

⚬ Files to Create/Modify:
  ⚬ Create packages/adapters/src/dicom-header-parser.ts
  ⚬ Create packages/adapters/src/local-multimodal-ocr.ts
  ⚬ Modify packages/adapters/src/fixture-ocr.ts
⚬ Implementation Requirements:
  1. dicom-header-parser.ts:
    ⚬ Inspect byte offset 128 for the 4-byte 'DICM' magic prefix.
    ⚬ Parse Group 0002, 0008, 0010, 0020, and 0028 tags: TransferSyntaxUID (0002,0010), SOPClassUID (0008,0016), SOPInstanceUID (0008,0018), StudyDate (0008,0020), Modality (0008,0060), InstitutionName (0008,0080), StudyInstanceUID (0020,000D), SeriesInstanceUID (0020,000E), and BurnedInAnnotation (0028,0301).
    ⚬ Scrub/pseudonymize Group 0010 PHI (PatientName, PatientID, PatientBirthDate) before emitting metadata.
    ⚬ Flag burnedInPhiWarning: true if BurnedInAnnotation is not explicitly "NO".
    ⚬ Emit deterministic administrative header lines as text_span objects with normalized coordinates (0..1). Never decode or interpret pixel data.
  2. local-multimodal-ocr.ts:
    ⚬ PDFs (application/pdf): Extract text items and bounding boxes per page via pdfjs-dist. Group items sharing the same horizontal row (\Delta y < 0.012 in normalized page height) so laboratory test names, values, units, and reference ranges stay in contiguous row spans (Ma et al., 2023; Li et al., 2024).
    ⚬ Images (PNG/JPG/TIFF/WebP): Read image dimensions (width, height), compute SHA-256 hash, and extract embedded text/metadata blocks so unseeded local image uploads never crash.
    ⚬ FHIR R4 JSON (application/fhir+json): Parse resourceType, Bundle.type, Composition header, Organization.name, stated dates, and entry resource counts into deterministic text_span lines.
    ⚬ VCF / HL7 (text/plain): Parse administrative file headers (##fileformat, ##fileDate, ##source, MSH segment date/facility) into text_span lines without interpreting genomic variants.

Task 2.3: Build SarvamVisionOcrAdapter (packages/adapters/src/sarvam-vision-ocr.ts)

⚬ File to Create: packages/adapters/src/sarvam-vision-ocr.ts
⚬ Implementation Requirements:
  1. MIME & Format Guardrail: Transcode image/tiff and image/webp to lossless PNG/PDF before calling Sarvam Vision so the API never returns HTTP 415 UNSUPPORTED_MEDIA_TYPE.
  2. 10-Page Batch Splitter: Split any PDF >10 pages into sequential \le 10-page chunks to respect Sarvam doc_ai’s 10-page hard cap per upload, mapping each returned page_num to globalPageNumber = batchIndex * 10 + localPageNum.
  3. Wire Protocol Compliance: Call Sarvam doc_ai digitise using language: "en-IN" (or detected Indic BCP-47 code) and output_format: "md" (never legacy language_code or "markdown"), governed by a token-bucket rate limiter respecting 10 requests/minute with exponential retry on service_overloaded.
  4. Dual-Coordinate Block Mapping: Parse metadata/page_NNN.json (width, height, blocks[] with id, reading_order, bbox, text, ocr_confidence, layout_confidence) into normalized [0..1] OncoBrief text_span rows.
  5. Auto-Fallback Routing (OCR_DRIVER=auto): Use SarvamVisionOcrAdapter when SARVAM_API_KEY is present, TextractOcrAdapter when AWS credentials are configured for Textract, and LocalMultimodalOcrAdapter as the zero-crash local fallback.

Task 2.4: Multi-Report PDF Packet Segmenter (packages/domain/src/ingestion/packet-segmenter.ts)

⚬ Files to Create:
  ⚬ packages/domain/src/ingestion/packet-segmenter.ts
  ⚬ packages/domain/src/ingestion/packet-segmenter.test.ts
⚬ Implementation Requirements (Damani et al., 2026):
  1. Implement segmentDocumentPacket(pages: readonly OcrPageInput[]): readonly PacketSubDocument[].
  2. Detect report boundaries across multi-page PDFs by identifying header transitions, page reset markers (Page 1 of X), facility changes, and canonical report titles (HISTOPATHOLOGY, BIOPSY, LABORATORY REPORT, COMPLETE BLOOD COUNT, BIOCHEMISTRY, PET-CT, MRI, CT SCAN, DISCHARGE SUMMARY, OPD CONSULTATION, PRESCRIPTION, INVOICE).
  3. Extract the stated report date and issuing facility for each sub-document and return { index, startPage, endPage, category, statedDate, statedFacility, confidence }.

PHASE 3: Two-Stage Span-and-Value Safety Gate, Conflict Detector & Boundary Scanner

Task 3.1: Upgrade span-validation.ts with Stage B Deterministic Value Entailment

⚬ Files to Modify:
  ⚬ packages/domain/src/provenance/span-validation.ts
  ⚬ packages/domain/src/provenance/span-validation.test.ts
⚬ Problem Fixed: Audit Defect #5 (validateCandidateProvenance checks that verbatimQuote is in text_span, but never checks that candidate.value is actually entailed in verbatimQuote).
⚬ Implementation Requirements:
  1. Stage A (Quote-in-Span Verification):
    ⚬ Confirm all candidate.spanIds exist on the target document.
    ⚬ Confirm normalized candidate.verbatimQuote is an exact substring of the concatenated text of the linked spans (ordered by pageNumber, lineIndex).
    ⚬ Compute the union bounding box (bboxUnion) and minimum ocrConfidence across the linked spans.
  2. Stage B (Value-in-Quote Deterministic Entailment):
    ⚬ Date Entailment (verifyDateInQuote): For ISO date values (YYYY-MM-DD), verify that verbatimQuote contains either the ISO string, numeric date (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY/MM/DD), or month-name format (15 Mar 2026, March 15, 2026, 15-Mar-2026).
    ⚬ Numeric / Tabular Lab Entailment (verifyLabValueInQuote): For lab or measurement candidates, verify that the exact numeric value token AND its stated unit token (if provided) appear inside verbatimQuote (Ma et al., 2023; Li et al., 2024).
    ⚬ String / Facility / Procedure Entailment (verifyTokensOrVocabInQuote): Tokenize candidate.value into significant alphanumeric words (\ge 3 characters, excluding stop words). Verify that either \ge 75\% of tokens appear in verbatimQuote OR a registered synonym from packages/domain/src/vocab for that canonical code appears in verbatimQuote.
  3. Confidence Routing (Asgari et al., 2025):
    ⚬ If Stage A or Stage B fails \rightarrow return { valid: false, stageFailed: 'STAGE_A' | 'STAGE_B', reason }.
    ⚬ If Stage A and Stage B pass and minOcrConfidence < 0.85 \rightarrow return { valid: true, recommendedState: 'needs_review' }.
    ⚬ If Stage A and Stage B pass and minOcrConfidence >= 0.85 \rightarrow return { valid: true, recommendedState: 'extracted' }.

Task 3.2: Cross-Document Contradiction Detection (packages/domain/src/detector.ts)

⚬ Files to Modify:
  ⚬ packages/domain/src/detector.ts
  ⚬ packages/domain/src/evidence-state-machine.ts
⚬ Implementation Requirements:
  1. Ensure the evidence state machine supports the 6 explicit review states recommended by the literature review: 'extracted' | 'needs_review' | 'conflicting' | 'verified' | 'corrected' | 'rejected'.
  2. When two grounded facts for the same patient and singleton attribute key (or same date + test/procedure type) carry incompatible normalized values across spans, mark both facts with a shared conflictGroupId and set their review state to 'conflicting' while preserving both source links.

Task 3.3: Expand Clinical Boundary CI Scanner (tools/check-clinical-boundary.ts)

⚬ File to Modify: tools/check-clinical-boundary.ts
⚬ Problem Fixed: Audit Defect #6 (tools/check-clinical-boundary.ts:73 only scans paths matching /ui/, /vocab/, or /labels).
⚬ Implementation Requirements:
  1. Remove the path-substring restriction so the scanner recursively inspects all .ts and .tsx source files across apps/web/src, apps/worker/src, packages/domain/src, packages/adapters/src, and packages/db/src (excluding *.test.ts, *.spec.ts, and clinical-boundary.ts itself).
  2. Fail with exit code 1 if any file contains forbidden clinical inference patterns (autonomous TNM staging calculation, RECIST tumor response calculation, clinical trial medical eligibility scoring, diagnostic imaging interpretation, or treatment prescribing).

PHASE 4: Unified Split-Screen Source & Bounding-Box Inspector (SourcePaneView.tsx)

Task 4.1: Consolidate Duplicate Viewers & Build SVG Bounding-Box Overlay

⚬ Files to Modify:
  ⚬ apps/web/src/components/SourcePaneView.tsx
  ⚬ apps/web/src/app/(app)/patients/[id]/sources/[documentId]/page.tsx
⚬ Problem Fixed: Audit Defect #7 (SourcePaneView.tsx and sources/[documentId]/page.tsx duplicate span rendering on a blank white div instead of rendering the original scan/PDF with SVG bounding-box overlays, and clip text on 375px mobile viewports via whitespace-pre overflow-hidden).
⚬ Implementation Requirements:
  1. Remove the duplicate inline span renderer from sources/[documentId]/page.tsx and render <SourcePaneView/> as the single source of truth.
  2. Add a segmented view mode toggle in SourcePaneView.tsx:
    ⚬ Mode 1: "Original Scan + BBox Overlay" (Default when documentUrl is present):
      ⚬ Render the source page image or PDF page canvas (pdfjs-dist / responsive <img> or <object> container) preserving the page aspect ratio (width / height).
      ⚬ Overlay an <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full"> layer.
      ⚬ Render each text_span bounding box (x, y, width, height normalized in 0..1) as an interactive <rect> scaled by 1000, highlighting active/selected fact spans in high-contrast Amber/Cobalt and auto-scrolling the active box into view when selected from the left evidence ledger.
    ⚬ Mode 2: "Structured OCR Layer":
      ⚬ Render reading-order text_span lines with line index badges, OCR confidence indicators, and active span highlights.
      ⚬ 375px Mobile Viewport Fix: Replace whitespace-pre overflow-hidden with whitespace-pre-wrap break-words overflow-x-auto max-w-full so long lines and tables never clip horizontally on 375px mobile screens.
  3. Add the Packet Sub-Document Jump Bar above the page selector so clinicians can jump directly to segmented reports (e.g., Pathology (p.1-2), Lab Panel (p.3-4), Discharge Summary (p.5-8)).

PHASE 5: Standards-Based FHIR R4 Import/Export Mapper (ABDM v6.5.0 & mCODE STU4)

Task 5.1: NRCeS ABDM v6.5.0 & HL7 mCODE STU4 Mappers

⚬ Files to Create:
  ⚬ packages/domain/src/fhir/abdm-bundle-mapper.ts
  ⚬ packages/domain/src/fhir/mcode-mapper.ts
  ⚬ packages/domain/src/fhir/fhir-mapper.test.ts
⚬ Implementation Requirements:
  1. abdm-bundle-mapper.ts:
    ⚬ Map verified/corrected intermediate facts into NRCeS ABDM v6.5.0 DocumentBundle JSON ([https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle](https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle)) supporting the 8 canonical profiles (OPConsultRecord, DischargeSummaryRecord, DiagnosticReport, PrescriptionRecord, WellnessRecord, ImmunizationRecord, HealthDocumentRecord, Invoice).
    ⚬ Enforce strict validator rules: Composition at Bundle.entry[0], urn:uuid:<uuid> RFC 4122 internal references, SNOMED CT and LOINC coding with display strings, ISO 8601 timestamps with +05:30 IST offset, and a linked FHIR Provenance resource carrying documentId, pageNumber, bbox, and charInterval.
  2. mcode-mapper.ts:
    ⚬ Provide a separate export function for HL7 FHIR R4 mCODE STU4 profiles (CancerRelatedSurgicalProcedure, RadiotherapyCourseSummary, LOINC lab Observations) without claiming that mCODE profiles automatically satisfy Indian ABDM profile validation.

4. End-to-End Verification & Testing Plan

Antigravity must write and execute tests across all five layers below to verify the build from database triggers up to the 375px mobile UI.

4.1 Layer 1: Database & Immutability Migration Tests (packages/db)

⚬ Test File: packages/db/src/__tests__/text-span-immutability.test.ts
⚬ Test Cases to Execute:
  1. Insert a document, document_page, and text_span row as oncobrief_app \rightarrow Expect PASS.
  2. Execute UPDATE text_span SET text = 'mutated' WHERE id = $1 \rightarrow Expect FAIL with SQLSTATE 42501 (Provenance violation: text_span rows are immutable).
  3. Execute DELETE FROM text_span WHERE id = $1 while parent document_page exists \rightarrow Expect FAIL with SQLSTATE 42501.

4.2 Layer 2: Pure Domain Unit Test Matrix (packages/domain)

⚬ Test Files:
  ⚬ packages/domain/src/provenance/span-validation.test.ts
  ⚬ packages/domain/src/ingestion/packet-segmenter.test.ts
  ⚬ packages/domain/src/detector.test.ts
  ⚬ packages/domain/src/fhir/fhir-mapper.test.ts
⚬ Test Cases to Execute:

Test ID	Scenario	Input Fixture	Expected Outcome
DOM-01	Stage A Quote Mismatch	verbatimQuote not present in linked text_spans	valid: false, stageFailed: 'STAGE_A'
DOM-02	Stage B Hallucinated Date	Quote says "Report Date: 14/05/2026", candidate value is "2026-09-01"	valid: false, stageFailed: 'STAGE_B'
DOM-03	Stage B Localized Date Match	Quote says "Collected on 14 May 2026", candidate value is "2026-05-14"	valid: true, recommendedState: 'extracted'
DOM-04	Stage B Lab Value Missing Unit	Quote says "Hemoglobin: 11.4 g/dL", candidate has value "14.2 g/dL"	valid: false, stageFailed: 'STAGE_B'
DOM-05	Stage B Facility Hallucination	Quote says "Issued by Apollo Cancer Centre", candidate value is "AIIMS Delhi"	valid: false, stageFailed: 'STAGE_B'
DOM-06	Low OCR Confidence Routing	Valid Stage A + Stage B, but span ocrConfidence = 0.78	valid: true, recommendedState: 'needs_review'
DOM-07	Multi-Report Packet Split	6-page PDF with Pathology (p.1–2), CBC Lab (p.3), Discharge Summary (p.4–6)	Returns 3 PacketSubDocument objects with accurate page bounds, categories, and dates
DOM-08	Cross-Document Contradiction	Doc A states surgery date 2026-02-10, Doc B states primary surgery date 2026-03-15	Both facts preserved; both transitioned to conflicting with shared conflictGroupId
DOM-09	ABDM v6.5.0 Bundle Structure	Verified lab + consultation facts exported via exportToAbdmDocumentBundle	Bundle.entry[0].resource.resourceType === 'Composition', all refs match ^urn:uuid:, timestamps end in +05:30

4.3 Layer 3: Multi-Modal Adapter & Worker Ingestion Tests (packages/adapters & apps/worker)

⚬ Test File: packages/adapters/src/__tests__/multimodal-intake.test.ts
⚬ Test Cases to Execute:
  1. Unseeded PDF Upload (LocalMultimodalOcrAdapter): Feed an arbitrary multi-page PDF with a 4-column lab table \rightarrow verify page dimensions, normalized 0..1 bounding boxes, row-grouped lab text spans, and zero FixtureOcrAdapter crashes.
  2. Sarvam Vision >10-Page Batching & TIFF Transcoding (SarvamVisionOcrAdapter): Feed a 23-page PDF and a .tiff scan against a mocked Sarvam doc_ai server \rightarrow verify the TIFF is transcoded to PNG/PDF, the 23-page PDF is dispatched in 3 batches (10 + 10 + 3), global page numbers map to 1..23, and language="en-IN" / output_format="md" wire params are sent.
  3. DICOM Header Intake (dicom-header-parser.ts): Construct a synthetic binary buffer with 128-byte preamble + 'DICM' + tags (0008,0060)="CT", (0008,0020)="20260615", (0010,0010)="Real^Patient", (0028,0301)="YES" \rightarrow verify Modality: CT and StudyDate: 2026-06-15 are extracted, PatientName is scrubbed, and burnedInPhiWarning === true.
  4. FHIR R4 & VCF Non-Interpretive Intake: Feed a FHIR DiagnosticReport JSON bundle and a .vcf header file \rightarrow verify only administrative metadata and provenance spans are generated.

4.4 Layer 4: API Security & Smoke Test Matrix (pnpm smoke:api — 11/11 Gate)

Execute pnpm smoke:api and verify all 11 endpoint assertions pass:

1. POST /api/v1/patients/[id]/documents/upload-url without auth \rightarrow 401.
2. POST /api/v1/patients/[id]/documents/upload-url with unauthorized role \rightarrow 403.
3. POST /api/v1/patients/not-a-uuid/documents/upload-url \rightarrow 400.
4. POST /api/v1/patients/[id]/documents/upload-url with malformed JSON body \rightarrow 400.
5. POST /api/v1/patients/[id]/documents/upload-url with unsupported contentType: "application/x-msdownload" \rightarrow 400.
6. POST /api/v1/patients/[id]/documents/upload-url with sizeBytes: 30000000 (>25\text{ MB}) \rightarrow 413.
7. POST /api/v1/patients/[id]/documents/upload-url with valid payload when STORAGE_DRIVER=fs \rightarrow 501.
8. GET /api/v1/storage/local with valid presigned HMAC query params and document:read_page permission \rightarrow 200 OK with matching Content-Type and binary stream.
9. GET /api/v1/storage/local with expired timestamp, tampered sig, or key=../../etc/passwd \rightarrow 403 FORBIDDEN.
10. GET /api/v1/patients/[id]/documents/[documentId]/pages/1 with Bearer token & RBAC check \rightarrow 200 OK containing documentUrl and spans[].
11. GET /api/v1/evidence/[id] \rightarrow 200 OK with non-null presigned documentUrl in STORAGE_DRIVER=fs mode.

4.5 Layer 5: Frontend Split-Screen & 375px Mobile Responsive Tests (apps/web)

⚬ Verification Scenarios:
  1. Desktop Split-Screen (1440x900): Open /patients/[id]/sources/[documentId]. Verify left pane displays extracted facts grouped by category with status badges (Extracted, Needs Review, Conflicting, Verified). Verify right pane renders SourcePaneView in "Original Scan + BBox Overlay" mode with SVG <rect> overlays aligned over the page. Click a fact in the left pane and verify the corresponding SVG <rect> highlights and scrolls into view.
  2. Mobile Viewport (375x812): Resize viewport to 375px width. Toggle SourcePaneView to "Structured OCR Layer". Verify document.documentElement.scrollWidth <= 375 and that long pathology/tabular lines wrap cleanly (whitespace-pre-wrap break-words) with zero horizontal text clipping.

5. Master Command Checklist for Antigravity

Run the following commands in sequence from the repository root (OncoBrief/). Every command must exit with code 0:

# 1. Install dependencies & verify workspace integrity
pnpm install --frozen-lockfile

# 2. Apply PostgreSQL migrations (including 0008_lock_text_spans.sql)
pnpm --filter @oncobrief/db migrate

# 3. Run full monorepo TypeScript typechecking (strict mode, no-explicit-any, noUncheckedIndexedAccess)
pnpm -r typecheck

# 4. Run clinical boundary compliance scanner across all apps/ and packages/
pnpm check:boundary

# 5. Run all unit & integration tests across domain, adapters, db, worker, and web
pnpm test

# 6. Build production bundles for all packages and apps
pnpm -r build

# 7. Run the 11/11 API smoke & security test suite
pnpm smoke:api


Definition of Done Checklist

⚬ [ ] 0008_lock_text_spans.sql applied; text_span rows cannot be updated or deleted by oncobrief_app.
⚬ [ ] /api/v1/storage/local streams presigned local files with RBAC (document:read_page) and path-traversal protection.
⚬ [ ] upload-url/route.ts validates auth, RBAC, UUID, JSON, filename, MIME allowlist, and 25 MB size cap before checking STORAGE_DRIVER=fs (11/11 pnpm smoke:api pass).
⚬ [ ] actions.ts enforces the 25 MB streaming upload guard via readBoundedUploadFile.
⚬ [ ] apps/worker/src/index.ts runs cleanly in local dev (QUEUE_DRIVER=memory) without exiting with code 2 or leaking resources per poll tick.
⚬ [ ] OCR_DRIVER wired across env/config/ports with SarvamVisionOcrAdapter (\le 10-page batching + TIFF/WebP transcoding) and LocalMultimodalOcrAdapter (PDF row-grouped tables, DICOM headers, FHIR R4 JSON, VCF headers).
⚬ [ ] Multi-report PDF packets are automatically segmented, classified, and dated (packet-segmenter.ts).
⚬ [ ] validateCandidateProvenance enforces both Stage A (quote-in-span) and Stage B (value-in-quote entailment) and routes ocr_confidence < 0.85 to needs_review.
⚬ [ ] Cross-document contradictions are flagged as conflicting without silent LLM reconciliation.
⚬ [ ] tools/check-clinical-boundary.ts scans all .ts/.tsx files across apps/ and packages/.
⚬ [ ] SourcePaneView.tsx consolidates source rendering with "Original Scan + SVG Bounding-Box Overlay", "Structured OCR Layer", Packet Jump Bar, and zero text clipping on 375px mobile viewports.
⚬ [ ] Verified ledger exports cleanly to separated NRCeS ABDM v6.5.0 DocumentBundle and HL7 FHIR R4 mCODE STU4 profiles.
