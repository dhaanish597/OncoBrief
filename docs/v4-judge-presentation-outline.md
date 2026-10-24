# OncoBrief V4 — Judge Presentation Deck Outline (10-Slide Structure)

> Current review note (2026-10-24): The synthetic local journey and relevant browser acceptance have been independently executed. See [actual results](v4-final-test-report.md) and [scene limitations](v4-final-demo-validation.md). External providers, spoken regional audio and narrated timing remain unverified.


**Track:** Health-a-thon 2026 — Cancer Care Track  
**Presentation Time Budget:** Planning allowance: 4 minutes slides + up to 10 minutes demo + Q&A; narrated timing is unverified  
**Positioning Statement:** Source-Anchored Oncology Record-Readiness, OPD Flow Optimization, and Multilingual Care Continuity — Built on an Append-Only Cryptographic Evidence Ledger with a Hard Non-Diagnostic Boundary.

---

## Slide-by-Slide Outline, Speaker Notes & Visual Proof

### Slide 1 — Title & Clinical Positioning
- **Headline:** **OncoBrief V4: From Fragmented Cancer Folders to Source-Verified Consultation Readiness**
- **Sub-headline:** Health-a-thon 2026 · Cancer Care Track · Non-Diagnostic Clinical Documentation & Workflow Infrastructure
- **On-Slide Visual:** Architectural split diagram showing fragmented multi-facility PDFs/faxes/FHIR bundles entering the immutable Evidence Ledger (`extracted` -> `conflicting` / `verified`) and powering OPD Readiness, Productivity Studio, and Caregiver Continuity.
- **Speaker Notes (30s):**
  - Introduce OncoBrief V4 as an administrative and documentation readiness platform purpose-built for high-volume Indian oncology outpatient departments (OPDs) and multidisciplinary tumour boards.
  - State the core safety thesis upfront: *"We never ask AI to guess a cancer stage or recommend a drug. We make every fact in a fragmented patient record traceable to its exact source page, character span, and human verifier."*

---

### Slide 2 — The Oncology Administrative Bottleneck in India
- **Headline:** **The Cost of Reconstructing Fragmented Oncology Records**
- **Key Bullet Points:**
  - **Multi-Facility Fragmentation:** The synthetic referral spans four invented facilities and ten initial documents. It illustrates fragmentation without claiming a measured hospital prevalence.
  - **Silent Transcription Contradictions:** A pathology report and discharge summary record different surgery dates (`12 June 2025` vs. `3 July 2025`), or duplicate faxes obscure whether an IHC/FISH receptor panel is actually complete.
  - **Vacant OPD Slots & Caregiver Drop-Off:** Last-minute cancellations leave specialist slots idle while waitlisted patients with complete records wait outside, and family caregivers miss preparation instructions due to language barriers.
- **On-Slide Visual:** Screenshot of `/workspace` showing `DEMO-001` (`blocked` / `red`), `DEMO-002` (`blocked` / `red`), and `DEMO-003` (`ready` / `green`).
- **Speaker Notes (30s):**
  - Use the synthetic conflict example to explain OncoBrief's readiness workflow. Do not claim competitor failure rates or measured hospital time savings.

---

### Slide 3 — Architecture: Six Packages, Forced RLS & Append-Only Evidence Ledger
- **Headline:** **Zero-Trust Multi-Tenant Architecture & Cryptographic Provenance**
- **Key Bullet Points:**
  - **6 Strictly Layered Packages:** `@oncobrief/domain` (zero-I/O state machines & FHIR mappers) -> `@oncobrief/ports` -> `@oncobrief/adapters` -> `@oncobrief/db` (PostgreSQL 16 + migrations `0001`–`0015`) -> `@oncobrief/web` (Next.js 15 App Router) & `@oncobrief/worker`.
  - **Database-Enforced Tenant Isolation:** Tenant RLS uses `app_current_org_id()` under the restricted application database login. Core and V4 tables use forced RLS; some ABDM tables enable RLS without FORCE. Privileged database roles remain a trusted boundary.
  - **Two Immutable Hash-Chained Streams:** `ledger_entry` (*what the record believes and why*) and `audit_event` (*who did what, with PHI redacted*), protected by `BEFORE UPDATE OR DELETE` database triggers.
- **On-Slide Visual:** Schema & hash-chain diagram (`GENESIS_PREV_HASH` -> `computeLedgerEntryHash` / `computeAuditEntryHash`) + `/patients/[id]/audit` `ledger hash chain: verified` badge.
- **Speaker Notes (30s):**
  - Emphasize that immutability and tenant isolation are enforced by PostgreSQL triggers and RLS policies, not just UI buttons.

---

### Slide 4 — Multi-Modal & Interoperable Intake (ABDM v6.5.0 & HL7 mCODE STU4)
- **Headline:** **Every Fact Anchored to Page, Character Offset, and Bounding Box**
- **Key Bullet Points:**
  - **Hybrid OCR Routing (`ocr-routing.ts`):** `SarvamVisionOcrAdapter` (`sarvam-vision-v1`) for Indic/English clinical documents selected by the configured driver; `auto` chooses configured Sarvam, then configured Textract, then local deterministic parsing via `LocalMultimodalOcrAdapter` (PDF, DICOM headers, FHIR R4 JSON, vCard).
  - **FHIR Interoperability Prototype:** Imports and exports FHIR-shaped oncology bundles and synthetic ABDM/mCODE examples; the local validator is a structural envelope check, not full profile-conformance validation or certification; M3 HIU pull implements real **Fidelius X25519 ECDH + HKDF-SHA256 + AES-256-GCM** decryption with immediate ephemeral key wiping (`wipeBuffer`).
  - **Strict Omission & Quarantine:** Scans without a text layer when cloud OCR is offline are quarantined as `manual_transcription_required`—never guessed.
- **On-Slide Visual:** Screenshot of `/patients/[id]/sources` showing `Upload / Import Records`, ABDM M3 consent lifecycle, and near-duplicate document linking.
- **Speaker Notes (30s):**
  - Highlight how consent revocation (`0010_abdm_revoked_source_access.sql`) restricts source access via a `RESTRICTIVE` RLS policy without mutating historical ledger hashes.

---

### Slide 5 — Consultation Readiness: Longitudinal Deltas & 2-Click Batch Verification
- **Headline:** **Source-Linked Pre-Consultation Orientation Without Clinical Inference**
- **Key Bullet Points:**
  - **Changes Since Last Consultation (`ChangesSinceLastVisitBanner.tsx`):** Automatically computes interval deltas against `patient.last_consultation_date` (new documents, new extracted facts, dated labs, open conflicts).
  - **Longitudinal Lab Flowsheet (`LongitudinalLabFlowsheet.tsx`):** Displays serial oncology labs (e.g., `DEMO-001` Haemoglobin `11.4 g/dL` -> `10.2 g/dL`, arithmetic delta `-1.2 g/dL`) with 1-click jump to the source PDF page—never generating autonomous "normal/abnormal/critical" interpretations.
  - **2-Click Atomic Batch Verification (`verifyEvidenceBatch`):** Clinicians review and verify all high-confidence ($\ge 90\%$ OCR), non-conflicting facts in a single ACID transaction.
- **On-Slide Visual:** Screenshot of `ChangesSinceLastVisitBanner`, `LongitudinalLabFlowsheet`, and `BatchVerificationModal`.
- **Speaker Notes (20s):**
  - Transition directly to how OncoBrief handles the facts that *cannot* be batch-verified: contradictory source documents.

---

### Slide 6 — Conflicting Source Claims & Reconciliation Room
- **Headline:** **Why OncoBrief Refuses to Average Two Contradictory Dates**
- **Key Bullet Points:**
  - **Deterministic Conflict Detection (`detectAndRecordConflicts`):** Automatically flags competing values for the same `slot_key` (e.g., `DEMO-001` surgery date `12 June 2025` in histopathology vs. `3 July 2025` in discharge summary) and transitions both facts to `conflicting`.
  - **Staleness Re-Opening (`DEMO-002`):** If a new document arrives *after* a consultation packet was approved and contradicts a verified appointment or lab, OncoBrief opens a new conflict and marks the prior packet `ledgerAdvanced = true` (stale).
  - **Human-Only Reconciliation Room:** Clinicians inspect both original pages side by side and record `retain_both`, `mark_superseded`, or `corrected` with a mandatory audit reason.
- **On-Slide Visual:** Side-by-side Reconciliation Room view (`/patients/[id]/conflicts/[conflictId]`).
- **Speaker Notes (20s):**
  - Emphasize that open conflicts block consultation readiness (`blocked` band) and are excluded from verified Studio referral letters.

---

### Slide 7 — Smart Oncology OPD Flow Optimizer & Role-Routed Task Ownership
- **Headline:** **Reviewing Vacant OPD Capacity with Transparent, Readiness-Aware Backfill**
- **Key Bullet Points:**
  - **OPD Slot State Machine (`opd-flow.ts`):** Tracks `scheduled`, `checked_in`, `in_consult`, `delayed_investigation`, `cancelled`, `no_show`, `vacant`, and `walk_in` slots with row-level `FOR UPDATE` locking and append-only `opd_slot_event` logs.
  - **Deterministic Eligible-Candidate Order (`slot-optimizer.ts`):** Only current record-ready, checklist-backed, clinic/date-matching candidates with accessible sources and no overlapping appointment/active offer are eligible. Authorized `expedited_slot_requested` provenance sorts first, followed by requested date, creation time, and ID. No numeric priority or travel/medical score exists.
  - **Offer vs. Assignment Honesty:** `offerOpdSlot` reserves a slot (`waitlist.status = 'offered'`) with a unique partial index (`opd_one_active_offer_slot`); only staff-confirmed `registerWalkIn` assigns an arrived walk-in. Release an existing offer before selecting that waitlist entry for walk-in registration. No acceptance or expiry endpoint exists.
- **On-Slide Visual:** Screenshot of `OpdWorkspace.tsx` on `/workspace` + `TaskOwnershipControls.tsx` on `/patients/[id]/tasks`.
- **Speaker Notes (20s):**
  - Point out how coordinators and records officers confirm named task owners and deadlines; no Claim Task or Escalate control is implemented.

---

### Slide 8 — Clinician Productivity Studio & Institutional Guideline RAG
- **Headline:** **Four Source-Cited Oncology Drafts + Verbatim Synthetic SOP References**
- **Key Bullet Points:**
  - **4 Structured Studio Formats (`draft-generator.ts`):**
    1. *Specialist Referral / Transfer Letter* (`[E#]` citations)
    2. *Multidisciplinary Tumor Board Deck* (6 Markdown slides with `[E#]` facts, open conflicts, and `[G#]` synthetic institutional SOP spans)
    3. *De-Identified Academic Case Report Draft* (relative `Day 0` / `Day +N` timeline + regex leak scanner `validateDeidentification`)
    4. *Patient & Caregiver Visit Summary* (plain-language administrative visit instructions)
  - **Citation & Source-Withdrawal Gate (`studio.ts`):** Uses persisted patient source IDs and exact source/template clauses, rejects unsupported edits, rechecks at export, hashes canonical `(markdownBody, citedFactIds, citedGuidelineIds, approvedBy, approvedAt)` with SHA-256 on clinician approval, and blocks export (`409 Conflict`) if any cited source document has consent withdrawn.
- **On-Slide Visual:** Screenshot of `ProductivityStudio.tsx` showing a 6-slide Tumor Board deck and its 64-char SHA-256 approval hash.
- **Speaker Notes (20s):**
  - Highlight that Slide 6 of the Tumor Board deck is always blank for the clinician's consensus sign-off.

---

### Slide 9 — Consented Caregiver Network & 11-Locale Voice Continuity
- **Headline:** **Consented Caregiver Continuity and 11 Selectable Voice Locales**
- **Key Bullet Points:**
  - **Consented Caregiver Registry (`caregivers.ts`):** Records designated family caregivers (`relationship`, `phone_number`, `preferred_locale`, `prefers_voice_note`, `sync_reminders`, `consent_recorded_by`).
  - **Immediate Revocation Enforcement (`deliverMessage`):** Active consented caregivers receive synchronized reminder dispatches in `message_outbox`; calling `revokeCaregiverConsent` immediately sets `is_active = false, revoked_at = now()` and suppresses all future dispatches.
  - **11-Locale Regional Voice Preview (`ContinuityAudioPlayer.tsx`):** Supports `en-IN` + 10 Indic languages (`hi-IN`, `ta-IN`, `te-IN`, `bn-IN`, `mr-IN`, `kn-IN`, `ml-IN`, `gu-IN`, `pa-IN`, `or-IN`) as selectable TTS locale codes. Sarvam is external and unverified; the browser fallback is user initiated and depends on installed voices. Changing the locale does not translate approved message text.
  - **Two-Way Administrative Attendance Log:** Records `confirmed_attendance`, `cannot_attend`, or `needs_coordinator_assistance` without triggering autonomous medical actions.
- **On-Slide Visual:** Screenshot of `/patients/[id]/continuity` showing caregiver cards, 11-locale audio player, and two-way attendance panel.
- **Speaker Notes (20s):**
  - Emphasize honest simulation labeling (`simulated delivery` and `Browser Speech Synthesis (Offline Fallback)`).

---

### Slide 10 — Verification Rigor, Honest Boundaries & Live Demo Transition
- **Headline:** **Verified Engineering Evidence & Non-Diagnostic Safety Guarantees**
- **Key Bullet Points:**
  - **17 FORBIDDEN_CONCEPT_PATTERNS Enforced in CI (`clinical-boundary.ts`):** Static and runtime guards block `risk_score`, `prognosis`, `treatment_recommendation`, `staging_computed`, `triage`, `recist_calc`, and `treatment_prescribing`.
  - **Defense-in-Depth Verification:**
    - 15 PostgreSQL migrations (`0001`–`0015`); core/V4 RLS is forced, while some ABDM tables enable RLS without FORCE.
    - Unit, database integration, security regression, and browser checks must be reported with the exact current commands, test counts, viewport coverage, and results. Historical reports are not evidence of a newly executed acceptance run.
    - Transparent distinction between `WORKING LOCALLY` and `SIMULATED` external integrations.
- **On-Slide Visual:** Verification summary scorecard + QR/link to `docs/v4-judge-demo-runbook.md`.
- **Speaker Notes (20s):**
  - Transition into the live 10-scene demonstration starting at `/login` with `dr.rao@rci.demo`.


Presentation limits: engineered workflow capability is locally testable; minutes saved, throughput, attendance and clinical outcomes remain hypotheses. A local build or automated test is not clinical, HIPAA, DPDP, accessibility, ABDM, mCODE, or pilot certification. Academic drafts can fail the privacy gate; de-identified FHIR is intentionally blocked. Browser speech may have no installed voice, and the synthetic audio fixture is silent.
