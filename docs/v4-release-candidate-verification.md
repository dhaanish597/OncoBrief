# OncoBrief V4 — Release Candidate Verification & Integration Truth Report

> **Historical assessment — superseded on 24 October 2026.** The claims below are preserved as the input to the independent review, not current verification or certification. The original checkout failed typecheck; all six claimed fixes were only partial, and additional P0/P1 defects were reproduced. There are 15 migrations, several RLS tables are not forced, fixture distribution/readiness differs, OPD has no numeric score or patient acceptance API, and actual browser speech is unavailable in tested Chromium. No shadow-pilot authorization or production readiness is established. Use [Codex independent review](v4-codex-independent-review.md), [actual test results](v4-final-test-report.md), and [validated demo limitations](v4-final-demo-validation.md). **Do not quote the historical VERIFIED/CERTIFIED labels, timings, fixture quotes, or integration claims below as current facts.**


**Verification Date:** 2026-10-24  
**Target Release:** OncoBrief V4 Release Candidate (Health-a-thon 2026 — Cancer Care Track)  
**Database Engine:** PostgreSQL 16.15 (`localhost:5432/oncobrief`)  
**Scope:** Authoritative verification of live database state, schema migrations (`0001`–`0015`), P0/P1 defect remediations, automated test and build verification gates, and an honest integration status matrix.

---

## 1. Live Database & Synthetic Fixture Verification

Direct verification against the live PostgreSQL 16 instance (`postgres://postgres:postgres@localhost:5432/oncobrief`) confirmed the following persisted state:

### 1.1 Synthetic Patient Inventory (`patient` table)

| Demo Code | Display Name | `is_demo_fixture` | `last_consultation_date` | Tenant / Role |
| :--- | :--- | :--- | :--- | :--- |
| **`DEMO-001`** | `DEMO-001 — Fragmented referral` | `true` (`t`) | `2025-07-05` | Primary Demo Tenant (`Regional Cancer Institute — Demo`) |
| **`DEMO-002`** | `DEMO-002 — Staleness` | `true` (`t`) | `2025-06-10` | Primary Demo Tenant (`Regional Cancer Institute — Demo`) |
| **`DEMO-003`** | `DEMO-003 — Ready` | `true` (`t`) | `2025-03-15` | Primary Demo Tenant (`Regional Cancer Institute — Demo`) |
| **`DEMO-001`** | `DEMO-001 — Other tenant` | `true` (`t`) | `NULL` | Secondary Tenant (Cross-Tenant RLS Isolation Fixture) |

- **Non-Synthetic Patient Guard:** `SELECT count(*) FROM patient WHERE is_demo_fixture = false` returns **`0` rows**, confirming the database contains exclusively synthetic demonstration fixtures.

### 1.2 Live Record, Ledger, OPD, Caregiver & Guideline Counts

| Database Table / Subsystem | Live Persisted Count | Verification Notes |
| :--- | :--- | :--- |
| **`document`** | `25` documents | 24 primary-tenant synthetic oncology documents (`DEMO-001`: 10, `DEMO-002`: 5, `DEMO-003`: 9) + 1 secondary-tenant RLS fixture document. |
| **`evidence_fact`** | `118` facts | Span-anchored facts across diagnosis, biomarker/IHC, surgery/procedure, systemic therapy, radiation, serial CBC labs, appointments, and instructions. |
| **`ledger_entry`** | `159` entries | Append-only SHA-256 hash-chained state transitions (`extracted`, `verified`, `conflicting`, `superseded`, `corrected`). |
| **`audit_event`** | `147` events | Append-only SHA-256 hash-chained security/audit stream with PHI/quotes/phone numbers redacted via `redactMetadata`. |
| **`opd_appointment_slot`** | `4`–`6` slots | Includes `scheduled`, `checked_in`, and `vacant` slots across oncology specialists. |
| **`opd_waitlist_entry`** | `1`–`4` entries | Waitlist backfill candidates with deterministic `priority_score` (`0..100`) and `idx_opd_waitlist_one_active_offer_per_slot` reservation uniqueness constraint. |
| **`guideline_document` / `guideline_span`** | Seeded corpus (`inst-sop-breast-intake`, NCG & institutional SOPs) | Verbatim page/section/bounding-box spans for `[G#]` RAG citations. |
| **`caregiver_contact`** | `2` rows | Consented family caregiver rows with `preferred_locale`, `prefers_voice_note`, `sync_reminders`, `consent_recorded_at`, and `revoked_at` tracking. |

---

## 2. P0 & P1 Defect Repairs Verified

All six defects uncovered during the independent code and security audit have been repaired in the working tree alongside unit and database integration regression tests:

1. **DEF-P0-1 — Source Withdrawal Enforcement on Studio & Packet Exports + Canonical Studio Hash + Scoped FHIR Export (`VERIFIED`)**:
   - **Files:** `packages/db/src/services/studio.ts`, `apps/web/src/app/api/v1/studio/[artifactId]/export/route.ts`, `packages/db/src/services/packets.ts`, `apps/web/src/app/api/v1/packets/[packetId]/export/route.ts`
   - **Verification:**
     - `assertStudioArtifactSourcesAccessible` and `assertPacketSourcesAccessible` query `evidence_fact` joined to `document` (`d.ingest_error IS DISTINCT FROM 'consent_revoked_or_expired'`). If a source document is withdrawn *after* a Studio artifact or Consultation Packet was approved, export returns HTTP `409 Conflict` (`source_withdrawn_or_unavailable` / `packet_source_withdrawn`) and logs an `outcome = 'denied'` audit event.
     - `approveStudioArtifact` computes `snapshot_sha256` over the canonical JSON payload `{ markdownBody, citedFactIds, citedGuidelineIds, approvedBy, approvedAt }`.
     - `/api/v1/studio/[artifactId]/export?format=abdm|mcode` scopes exported FHIR resources strictly to `artifact.citedFactIds` and anonymizes `patientName` when `artifact.isDeidentified === true`.
   - **Regression Test:** `packages/db/test/studio.test.ts` (*"approves artifact by clinician, hashes canonical snapshot payload, and freezes artifact"* and *"blocks studio approval and export access when a cited source document is withdrawn via consent revocation"*).

2. **DEF-P0-2 — Studio Claim Grounding & Patient Handout Fallback Safety (`VERIFIED`)**:
   - **Files:** `packages/domain/src/studio/draft-generator.ts`, `apps/web/src/lib/actions.ts`
   - **Verification:**
     - `generateStudioDraft` (`patient_info_sheet`) no longer invents an unanchored bring-list sentence when `instructions.length === 0`; it states: `- No specific document-bring instructions are recorded in verified source evidence for this visit.`
     - `generateStudioDraft` excludes open `conflicting` facts (`f.state === 'conflicting'`) from verified claims in referral letters, academic case abstracts, and patient handouts.
     - `revalidateStudioMarkdownCitations` verifies that quantitative `lab_result` and `vital_sign` citations preserve the source numeric value on the citing line and blocks any text matching `AUTONOMOUS_DIRECTIVE_PATTERNS`.
   - **Regression Test:** `packages/domain/test/studio-safety-audit.test.ts` (*"patient visit summary handout does not generate ungrounded emergency warning signs or medical instructions"*, *"excludes open conflicting facts from verified claims"*, and *"rejects edited markdown when a cited lab value is altered to an ungrounded number or contains autonomous clinical directives"*).

3. **DEF-P0-3 — Audio Generation RBAC Authorization & 11-Locale Allow-List Validation (`VERIFIED`)**:
   - **Files:** `apps/web/src/app/api/v1/assistant/voice/tts/route.ts` (and `/api/v1/continuity/tts/route.ts`)
   - **Verification:** Enforces `can(session.role, 'patient:read')` (`403 Forbidden` if unauthorized) and validates `languageCode` against the 11 supported locales in `SUPPORTED_LOCALES` (`400 unsupported_language_code` if outside the allow-list).
   - **Regression Test:** `apps/web/src/lib/phase5-continuity-voice.test.ts` (*"enforces authentication and 11-locale allow-list on the TTS synthesis route"*).

4. **DEF-P0-4 — Caregiver Revocation Enforcement in `deliverMessage` & Audit Redaction Hardening (`VERIFIED`)**:
   - **Files:** `packages/db/src/services/messages.ts`, `packages/db/src/services/audit.ts`
   - **Verification:**
     - `deliverMessage` queries `caregiver_contact WHERE org_id = $1 AND patient_id = $2 AND is_active = true AND revoked_at IS NULL AND sync_reminders = true`, dispatching synchronized reminders only to active consented caregivers and zero dispatches to revoked caregivers.
     - `REDACT_KEYS` in `audit.ts` now redacts `patientAbha`, `abhaAddress`, `abha_address`, `abhaNumber`, `abha_number`, `aadhaarName`, `aadhaar_name`, `markdownBody`, `markdown_body`, `text`, and `note`.
   - **Regression Tests:** `packages/db/test/caregivers.test.ts` (*"synchronizes reminder dispatches to active consented caregivers and sends zero dispatches after revocation"*) and `packages/db/test/audit-redaction.test.ts`.

5. **DEF-P1-1 — Patient Audit Trail Coverage for Studio, Caregiver & OPD Entities (`VERIFIED`)**:
   - **File:** `packages/db/src/services/patients.ts` (`listPatientAudit`)
   - **Verification:** Added `studio_artifact`, `caregiver_contact`, `opd_appointment_slot`, and `opd_waitlist_entry` to the `UNION` subquery in `listPatientAudit`, ensuring Scene 10 of the judge demo displays all V4 actions on `/patients/[id]/audit`.
   - **Regression Test:** `packages/db/test/audit-redaction.test.ts` (*"includes studio_artifact and caregiver_contact audit events in listPatientAudit for Scene 9 audit review"*).

6. **DEF-P1-2 — Batch Verification E2E Selector Alignment, Synthetic Bundle Labeling & Demo Readiness Script (`VERIFIED`)**:
   - **Files:** `apps/web/e2e/phase2-consultation-readiness.spec.ts`, `apps/web/src/components/DocumentUploadForm.tsx`, `tools/prepare-demo.ts`, `package.json`
   - **Verification:** Aligned Playwright selectors (`open-batch-verify-btn` and `confirm-batch-verify-btn`), relabeled the sample FHIR bundle badge in `DocumentUploadForm.tsx` to `Synthetic Demo Fixture — Standard Ingest`, and added `pnpm demo:prepare` (`tools/prepare-demo.ts`).

---

## 3. Authoritative Integration Truth Table (`WORKING LOCALLY` vs. `SIMULATED`)

| Subsystem / Feature | Status | Exact Runtime Behavior in Local Demo Environment |
| :--- | :--- | :--- |
| **PostgreSQL 16 Forced RLS, Triggers & SHA-256 Hash Chains** | **`WORKING LOCALLY`** | Real PostgreSQL 16 enforcement across all 26 tenant tables and append-only `ledger_entry` / `audit_event` streams. |
| **Local PDF, FHIR R4 JSON, DICOM Header & vCard Intake** | **`WORKING LOCALLY`** | Deterministic local extraction via `LocalPdfTextOcrAdapter` and `LocalMultimodalOcrAdapter`. |
| **Sarvam Vision OCR (`sarvam-vision-v1`)** | **`WORKING LOCALLY` (Fallback Active) / External Unverified** | `FallbackOcrAdapter` routes to `LocalPdfTextOcrAdapter` when `SARVAM_API_KEY` is blank. Live Sarvam cloud OCR is not invoked without an external API key. |
| **Sarvam Bulbul v3 Voice TTS (`bulbul:v3`)** | **`WORKING LOCALLY` (Fallback Active) / External Unverified** | `/api/v1/continuity/tts` returns `503 sarvam_unavailable` when `SARVAM_API_KEY` is blank; `ContinuityAudioPlayer` automatically uses Browser Web Speech synthesis (`window.speechSynthesis`) with an explicit `Browser Speech Synthesis (Offline Fallback)` badge. |
| **Amazon Textract & AWS Bedrock** | **`WORKING LOCALLY` (Unit-Tested SigV4 Adapters) / External Unverified** | Verified via unit tests (`textract-ocr.test.ts`, `bedrock-llm.test.ts`); local demo runs `EXTRACTION_DRIVER=rule` and `LLM_PROVIDER=rule` with zero AWS dependency. |
| **ABDM M2 HIP & M3 HIU Gateway** | **`SIMULATED` (Loopback Gateway) + `WORKING LOCALLY` (Real Crypto)** | `ABDM_DRIVER=simulated` runs an in-process loopback gateway explicitly badged in UI (`Local simulation — no ABDM account or hospital connection`), while executing real X25519 ECDH + HKDF-SHA256 + AES-256-GCM Fidelius encryption/decryption (`abdm-crypto.ts`). |
| **NRCeS ABDM v6.5.0 & HL7 mCODE STU4 Bundle Import/Export** | **`WORKING LOCALLY`** | Real deterministic FHIR R4 JSON generation, schema validation, and ingestion. |
| **SMS / WhatsApp Reminder Delivery** | **`SIMULATED`** | `SimulatedDeliveryAdapter` writes `message_outbox` rows with `simulated = true` for the patient and active synced caregivers; UI displays `simulated delivery`. |
| **Two-Way Administrative Attendance Confirmation** | **`SIMULATED` (Coordinator-Logged)** | Coordinator records inbound patient/caregiver attendance response (`confirmed_attendance`, `cannot_attend`, `needs_coordinator_assistance`) via authenticated server action `recordAttendanceAction`. |
| **Browser Extension Overlay** | **`NOT IMPLEMENTED` (Deferred P2)** | Only the `extension_grant` schema table exists; `apps/extension` is not implemented. |

---

## 4. Residual Limitations & Honest Disclosure

1. **OPD Offer-Only Workflow:** `offerOpdSlot` reserves a vacant OPD slot for a waitlisted patient (`opd_waitlist_entry.status = 'offered'`, `offered_slot_id = slotId`), preventing concurrent double-offers via `idx_opd_waitlist_one_active_offer_per_slot`. There is no automated patient self-acceptance webhook (`acceptSlotOffer` does not exist); staff complete slot assignment via `registerWalkIn` when the patient confirms or arrives.
2. **External Cloud Provider Keys Unset by Default:** In `.env.example` / local offline mode, `SARVAM_API_KEY`, `NVIDIA_API_KEY`, `BEDROCK_MODEL_ID`, and `ABDM_CLIENT_SECRET` are unset by design so the demonstration runs deterministically offline without external network failures.
3. **No Regulatory or Clinical Certifications Claimed:** OncoBrief V4 is a hackathon demonstration release candidate for the Cancer Care Track. It is not HIPAA-certified, DPDP-certified, SaMD-certified, or clinically validated for patient outcome improvement.
