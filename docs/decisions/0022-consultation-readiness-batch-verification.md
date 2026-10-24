# 0022 — Consultation readiness experience, server-enforced batch verification, and standard bundle intake

Status: Accepted. Date: 2026-10-23.

## Context and decision

Phase 2 builds upon the longitudinal ledger and foundation schema from Phase 1 to deliver a clinician-ready consultation experience (`apps/web/src/app/(app)/patients/[id]/evidence/page.tsx`), server-enforced atomic batch verification (`verifyEvidenceBatch`), and standard oncology FHIR bundle ingestion and duplicate linking without dummy browser alerts.

### 1. Longitudinal Consultation Readiness & Changes Since Last Visit
Consultation readiness requires doctors to see what changed since the patient's previous consultation baseline without cognitive overload or manual re-triage:
- Baseline dates (`last_consultation_date`) establish a transparent interval delta computed strictly by pure domain functions (`computeIntervalDelta`).
- Displays truthful counts for new documents, new facts, reopened or new conflicts, pending investigations, and documented instructions.
- Functional filter chips allow switching instantly between: All evidence, Since last visit, Unverified, Conflicting, Verified, Longitudinal labs, and Medication history.
- Timeline node views now render authentic issuing facilities and accurate oncology modality labels (Pathology, Imaging, Surgery, Chemotherapy / Systemic, Radiation, Referral, Follow-up), completely eliminating hardcoded defaults like "Apollo Hospitals" or "CT Scan (Thorax)".

### 2. Longitudinal Lab Flowsheet & Medication History
- Serial laboratory observations on different dates (e.g. baseline vs. cycle reviews) are rendered in a clinician-friendly tabular flowsheet (`LongitudinalLabFlowsheet`).
- Displays test name, recorded date, value as written, unit as written, prior value, latest value, and arithmetic differences (e.g. `-1.2 g/dL since 02 Jun 2025`).
- Strictly adheres to the non-clinical boundary: zero clinical trend inference, zero automated diagnosis, and no silent normalization of conflicting observations or incompatible units.
- Documented oncology systemic regimens and administration records are rendered chronologically (`MedicationHistoryView`) preserving verbatim quotes and source links.

### 3. Server-Enforced Atomic Batch Evidence Verification
To streamline the verification of high-confidence extracted facts while guaranteeing medical evidence integrity:
- Clinicians inspect an explicit pre-confirmation modal displaying every selected fact, verbatim supporting quote, source document, page number, and confidence score with full individual deselect controls.
- Eligibility is enforced **server-side** inside `verifyEvidenceBatch`:
  1. Tenant (`org_id`) and patient isolation.
  2. Authorized reviewer role (`evidence:verify` permission check).
  3. Fact state must be `extracted` (never already verified, superseded, or rejected).
  4. OCR confidence must meet or exceed the conservative threshold (>= 0.90).
  5. The fact must not be a member of any open conflict set.
  6. Source document must be accessible and not revoked or quarantined.
- Verification executes atomically in PostgreSQL: appends individual append-only `ledger_entry` records (`action: 'fact_verified'`), updates `evidence_state`, creates `timeline_event`, syncs ABHA/MRN patient identifiers, logs a single atomic `evidence.batch_verified` audit event, and recomputes patient readiness (`computeAndPersistReadiness`).
- If any selected fact fails eligibility, the transaction aborts with a typed `BatchVerificationError`; partial silent updates are impossible.

### 4. Standards-Based FHIR Bundle Ingestion & Duplicate Linking
- Replaced non-functional alert popups in `DocumentUploadForm.tsx` with production server actions:
  - `importStandardBundleAction`: Validates FHIR R4 JSON schemas server-side via `validateFhirBundle`, supporting standard NRCeS ABDM v6.5.0 bundles (Tata Memorial / ACTREC referral & IHC panels), HL7 mCODE STU4 bundles (AIIMS oncology surgical/medication/lab records), and custom FHIR bundles. Ingests via `createDocument` (`sourceKind: 'fhir_document'`) and `ingestDocument` directly into the Evidence Ledger.
  - `linkExistingDocumentAction` & `searchPatientDocumentsAction`: Real deterministic duplicate search and human-confirmed linking across patient documents with tenant and patient boundary enforcement.

## Alternatives and security assumptions

- *Client-side batch verification without server re-validation*: Rejected. Client-side state can be stale, concurrent edits could race, or unauthorized clients could bypass confidence thresholds. All checks are strictly verified inside a single database transaction.
- *Silent deduplication or automated merging*: Rejected. Silently merging near-duplicate scans violates evidentiary provenance. Documents are flagged as duplicate candidates or confirmed duplicates by human review.
- *Clinical interpretation of lab deltas*: Rejected. Automated flags like "improving", "failing", or "worsening" cross the clinical boundary and violate project safety rules. Deltas are purely arithmetic string differences.
