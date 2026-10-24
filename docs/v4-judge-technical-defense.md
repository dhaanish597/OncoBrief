# OncoBrief V4 — Judge Technical & Clinical Defense Q&A Guide

> Current review note (2026-10-24): The synthetic local journey and relevant browser acceptance have been independently executed. See [actual results](v4-final-test-report.md) and [scene limitations](v4-final-demo-validation.md). External providers, spoken regional audio and narrated timing remain unverified.


**Event:** Health-a-thon 2026 — Cancer Care Track Judging Defense  
**Purpose:** Direct, evidence-backed responses to the toughest clinical, architectural, security, privacy, interoperability, and operational questions from medical oncologists and principal systems engineers.

---

## 1. Clinical Safety & Non-Diagnostic Boundary Questions

### Q1.1: *"How is OncoBrief different from an LLM medical summarizer or an AI clinical decision support (CDS) tool?"*
- **Direct Answer:** A generated summary alone does not establish source provenance, verification state, or explicit reconciliation. OncoBrief is **not** a clinical decision support tool—it is an **administrative record-readiness and cryptographic provenance ledger**.
- **Repository Proof:**
  1. Every extracted claim in `evidence_fact` must link via `evidence_span_link` to an immutable `text_span` (`char_start`, `char_end`, `bbox_x..h`) on a specific `document_page` (`packages/db/src/services/ledger.ts`).
  2. Every machine-extracted fact enters the ledger in `'extracted'` (unverified) state (`packages/domain/src/evidence/transitions.ts`) and cannot be used in an approved patient reminder (`checkMessageApprovalGate` in `packages/domain/src/messages/render.ts`) or final Studio sign-off (`revalidateStudioMarkdownCitations` in `packages/domain/src/studio/draft-generator.ts`) until a human verifies it.
  3. Seventeen forbidden clinical concepts (`risk_score`, `prognosis`, `treatment_recommendation`, `staging_computed`, `triage`, `recist_calc`, `trial_eligibility_scoring`, etc.) are blocked by `packages/domain/src/policy/clinical-boundary.ts` and verified in CI via `pnpm boundary:check`.

---

### Q1.2: *"What happens when two hospital documents disagree—for example, two different surgery dates or a rescheduled appointment?"*
- **Direct Answer:** OncoBrief never guesses which document is right. Our deterministic conflict detector (`detectAndRecordConflicts` in `packages/db/src/services/ledger.ts`) groups facts by `slot_key`, detects distinct normalized values across documents, creates an open `conflict_set`, and transitions both competing facts to `'conflicting'`.
- **Repository Proof:**
  - In `DEMO-001`, `histopathology-report.pdf` records mastectomy on `12 June 2025` while `discharge-summary.pdf` states `3 July 2025`. Both facts are placed in an open conflict, affecting the patient's administrative readiness band to `'blocked'` (`red`).
  - In `DEMO-002`, an appointment date conflict (`15 July 2025` vs. `22 July 2025`) arrives *after* a consultation packet was already approved, automatically setting `ledgerAdvanced = true` on the packet so clinicians see immediately that the frozen packet is stale.
  - Open conflicting facts are excluded from verified claims in Studio referral letters and patient handouts (`packages/domain/src/studio/draft-generator.ts:112`).

---

### Q1.3: *"Can a clinician or coordinator edit a Studio draft to insert an unverified claim, alter a lab number, or add emergency medical advice?"*
- **Direct Answer:** Arbitrary clinical prose is not approved merely because a citation exists. `loadStudioDraftInput` / `validateBoundStudioBody` (`apps/web/src/lib/studio-validation.ts`) bind citations to persisted patient fact IDs and regenerate a trusted template. The domain gate requires exact source clauses or trusted template lines, complete source bindings, and verified/corrected states. Unsupported paraphrases, extra numbers, unit changes, uncited assertions, and altered citation bindings are rejected. Directive checks supplement this restriction; they do not constitute semantic natural-language understanding.
- Create a successor draft when changing the source set. Approval locks the stored row and compares the validated body and bindings before hashing. Export rechecks both canonical hash and content, including legacy approvals. Source withdrawal blanks saved prose in the UI and blocks export. A human still checks the underlying source and the intended document.

---

### Q1.4: *"Does your Longitudinal Lab Flowsheet flag 'abnormal' or 'critical' values or interpret tumour marker trends?"*
- **Direct Answer:** Never. `buildLongitudinalLabFlowsheet` (`packages/domain/src/journey/longitudinal-review.ts`) extracts numeric values and units as written in the source report and computes only the **arithmetic interval delta** (`latestNumeric - previousNumeric`, e.g., `-1.2 g/dL since 02 Jun 2025`). It never computes reference-range abnormality flags, toxicity grades, or clinical trend interpretations.

---

## 2. Security, Privacy & Multi-Tenant Isolation Questions

### Q2.1: *"How do you prevent cross-tenant data leaks in PostgreSQL, including during unauthenticated ABDM webhook callbacks?"*
- **Direct Answer:** Tenant policies check `org_id = app_current_org_id()`. Core and V4 tables force RLS; some ABDM tables enable RLS without FORCE. Application access must use the restricted app login; owner/migrator credentials remain privileged and must not serve application requests.
- **Repository Proof:**
  - `withTenant` (`packages/db/src/client.ts`) connects through the application-role database URL, opens a transaction, and binds `set_config('app.org_id', orgId, true)`. If `app.org_id` is unset, `app_current_org_id()` returns `NULL` and all queries return `0` rows (`packages/db/test/security.test.ts` and `packages/db/test/abdm-security.test.ts`).
  - For inbound ABDM callbacks, `abdm_resolve_callback_tenant` (`0009_abdm_integration.sql`) is a narrow `SECURITY DEFINER` function that resolves only `(org_id, patient_id)` from a known outbound `request_id`, `consent_id`, `transaction_id`, or `facility_id`, failing closed (`0` rows) on unknown correlation tokens.

---

### Q2.2: *"How can you reconcile an immutable, append-only Evidence Ledger with a patient's right to withdraw consent under ABDM / DPDP?"*
- **Direct Answer:** Deleting rows from `ledger_entry` or `evidence_fact` would break the cryptographic SHA-256 hash chain and destroy medico-legal auditability. Instead, OncoBrief separates **cryptographic ledger integrity** from **source content accessibility**:
  1. When consent is revoked or expires (`purgeConsentData` in `packages/db/src/services/abdm-hiu.ts`), OncoBrief attempts deletion of raw objects, retains failed opaque object keys for retry, hides source access even on storage failure, and wipes the ephemeral X25519 private key (`ephemeral_private_key_enc = NULL`), and sets `document.ingest_error = 'consent_revoked_or_expired'`.
  2. Migration `0010_abdm_revoked_source_access.sql` applies a `RESTRICTIVE` RLS policy (`abdm_source_access`) across `evidence_fact`, `text_span`, `document_page`, `extraction_candidate`, and `timeline_event` so `oncobrief_app` immediately sees `0` rows from the withdrawn document.
  3. Even if a `consultation_packet` or `studio_artifact` was approved *before* consent withdrawal, `assertPacketSourcesAccessible` (`packages/db/src/services/packets.ts`) and `assertStudioArtifactSourcesAccessible` (`packages/db/src/services/studio.ts`) block export (`409 Conflict`) and record a `denied` audit event if any referenced fact belongs to a withdrawn source.

---

### Q2.3: *"Is your de-identified Academic Case Report HIPAA-certified or DPDP-certified?"*
- **Direct Answer:** No—and we explicitly forbid claiming regulatory certification. `generateStudioDraft` (`academic_case_abstract`) and `validateDeidentification` (`packages/domain/src/studio/draft-generator.ts`) implement **algorithmic direct-identifier suppression**: the generator uses relative event dates, while a scanner checks known patient name tokens, configured identifiers, contact patterns and calendar dates. Source text can retain identifiers; those leaks block approval instead of being guaranteed removed. Every generated draft embeds a mandatory notice stating that algorithmic suppression does **not** constitute certified expert determination under HIPAA §164.514(b)(1) or formal legal certification.

---

## 3. Smart OPD, Caregiver Continuity & Integration Honesty Questions

### Q3.1: *"In the Smart Oncology OPD workspace, does offering a vacant slot to a waitlisted patient mean the appointment is booked?"*
- **Direct Answer:** No. We strictly distinguish **slot reservation (`offered`)** from **confirmed walk-in assignment (`walk_in` / `slotted`)**:
  - `offerOpdSlot` (`packages/db/src/services/opd-flow.ts`) locks the slot and waitlist row (`FOR UPDATE`) and sets `opd_waitlist_entry.status = 'offered'` and `offered_slot_id = slotId`, protected by the partial unique index `opd_one_active_offer_slot` (`0013_opd_reservation_overlap.sql`). The slot itself remains `status = 'vacant'` with `patient_id = NULL`.
  - There is no automated patient self-acceptance webhook (`acceptSlotOffer` does not exist). Staff first release an existing offer, then explicitly confirm that the patient has arrived and execute `registerWalkIn` to assign vacant capacity (`opd_appointment_slot.status = 'walk_in'`, `opd_waitlist_entry.status = 'slotted'`), or release the reservation by setting the slot back to `vacant`.

---

### Q3.2: *"How are waitlisted candidates ordered without clinical triage?"*
- **Direct Answer:** `rankWaitlistForVacantSlot` in `packages/domain/src/flow/slot-optimizer.ts` emits an ordered eligible list and rationale, with no numeric score. It requires a matching configured clinic/date, current administrative readiness, an assigned checklist, accessible non-quarantined sources, and no overlapping active appointment or active offer. Server-side final selection revalidates eligibility under locks.
- Only an explicit authorized `expedited_slot_requested` administrative label with audit provenance sorts ahead. Remaining candidates use requested date, creation time, and entry ID. Travel distance, risk, symptoms, medical urgency, and labels such as `urgent_review` do not create a medical ranking. An administrative-ready record is not clinical clearance.
- Offer reservation and arrived walk-in assignment are separate human-confirmed actions. Neither sends a patient message, and there is no patient acceptance/expiry integration.

---

### Q3.3: *"Which external integrations are running live versus simulated in this demonstration?"*
- **Direct Answer:** We maintain strict epistemic honesty in both code and UI labels:
  - **Working Locally (Real Execution):** PostgreSQL 16 RLS & triggers, SHA-256 hash chains, local PDF/FHIR/DICOM/vCard parsing (`LocalPdfTextOcrAdapter` / `LocalMultimodalOcrAdapter`), prototype FHIR bundle mapping (structural validation only; no full ABDM/mCODE conformance certification), X25519 ECDH + HKDF-SHA256 + AES-256-GCM Fidelius encryption (`abdm-crypto.ts`), OPD slot optimizer, Studio draft generators, and browser speech where a suitable installed voice is available.
  - **Simulated Locally (Clearly Badged):** ABDM HIE-CM V3 Gateway (`ABDM_DRIVER=simulated` loopback), SMS/WhatsApp message outbox dispatch (`SimulatedDeliveryAdapter` with `simulated = true`), and coordinator-recorded inbound attendance confirmation (`recordMessageAttendance`).
  - **External Adapters Implemented (Live Cloud Acceptance Unverified):** `SarvamVisionOcrAdapter` (`sarvam-vision-v1`), `sarvamTts` (`bulbul:v3`), `TextractOcrAdapter`, and `BedrockLlmAdapter`.
  - **Deferred / Not Implemented:** Browser extension overlay (`apps/extension`).

The seed contains one synthetic institutional SOP with two spans, not an NCG publication or endorsed institutional protocol. Tata Memorial/ACTREC and AIIMS names in quick imports identify synthetic example bundles and do not imply an institutional connection or partnership. The audit-page badge checks ledger hash linkage, not payload recomputation or audit-stream verification. Research prevalence figures, preparation-time improvements, and hospital outcomes require separately verified primary sources or a measured pilot; this prototype does not establish them.


### Additional privacy and operational limits

TTS accepts a saved patient message (patient/message ID) or the current user’s saved assistant answer, checks accessible sources, and sends server-resolved text to the configured provider. Arbitrary client prose cannot be synthesized. A 503 response may offer the same validated text to an explicitly chosen installed local voice; denied/missing/withdrawn text has no fallback. Locale selection does not translate the text. Audio responses are marked no-store; this is not a guarantee about vendor retention or all device/browser behavior.

Caregiver dispatch rechecks active consent and sync preference with a row lock at send time. There is no separate asynchronous telecom dispatcher; a future delivery queue must perform the same check. A consent change cannot recall messages already delivered. Reminder variables are resolved from the same patient’s current source, then revalidated at approval and dispatch.
