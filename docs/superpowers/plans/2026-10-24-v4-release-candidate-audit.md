# OncoBrief V4 Release-Candidate Audit & Judge Demonstration Execution Plan

**Date:** 2026-10-24  
**Track:** Health-a-thon 2026 — Cancer Care Track (Strictly Non-Diagnostic / Non-Prescriptive)  
**Scope:** Evidence-based V4 release-candidate audit, reconciliation of `docs/v4-release-readiness-audit.md` against actual code and live PostgreSQL state, independent security & clinical safety review, TDD remediation of verified P0/P1 defects, and preparation of the 10-scene judging demonstration package.

---

## 1. Repository Reconnaissance & Baseline Preservation Checklist

- [x] **1.1 Inspect Working Tree & Preserve All Uncommitted Work**
  - Verified via MCP `git` (`git_status` and `git_diff`) that all Phase 1 through Phase 5 uncommitted changes in `/Users/dhaanish/Documents/OncoBrief` are intact.
  - Confirmed zero destructive git operations (`reset`, `clean`, `checkout`, `commit`, `push`) executed.
  - Audited diffs and `.env.example` for accidental private keys or credentials; confirmed zero leaked secrets.
- [x] **1.2 Read Root & Scoped Architecture/Verification Documents**
  - Reviewed `ONCOBRIEF_ENHANCEMENT_PLAN.md`, `AGENTS.md`, `CLAUDE.md`, `docs/v4-release-readiness-audit.md`, `docs/phase1-v4-verification-report.md` through `docs/phase5-v4-verification-report.md`, `phase3-verification-report.md`, `docs/security.md`, `docs/evidence-ledger.md`, and ADRs `0017` through `0025`.
- [x] **1.3 Inspect All Six Workspace Packages & Migrations (`0001`–`0015`)**
  - Inspected `@oncobrief/domain`, `@oncobrief/ports`, `@oncobrief/adapters`, `@oncobrief/db`, `@oncobrief/web`, and `@oncobrief/worker`.

---

## 2. Release-Readiness Audit Reconciliation Checklist

- [x] **2.1 Reconcile Discrepancy A — OPD Offer Acceptance (`packages/db/src/services/opd-flow.ts`)**
  - Corrected false claim in `docs/v4-release-readiness-audit.md` that `offerSlotToWaitlist` and `acceptSlotOffer` exist in `services/opd.ts`.
  - Documented exact implemented operations in `packages/db/src/services/opd-flow.ts`: `listBackfillCandidates`, `offerOpdSlot`, `registerWalkIn`, `updateOpdSlotStatus`, `listOpdWorkspace`, and `setOpdWaitlistPriority`.
  - Confirmed `offerOpdSlot` transitions `opd_waitlist_entry.status` to `'offered'` and sets `offered_slot_id` while keeping `opd_appointment_slot.status = 'vacant'` and `patient_id = NULL` (no patient acceptance endpoint or automated slot assignment).
  - Confirmed `registerWalkIn` is the only action that assigns a waitlist candidate to a vacant slot (`opd_appointment_slot.status = 'walk_in'`, `opd_waitlist_entry.status = 'slotted'`).
- [x] **2.2 Reconcile Discrepancy B — Database & Service Paths**
  - Corrected false table names (`appointment_slot`, `opd_queue_entry`, `waitlist_entry`) and false file paths (`packages/db/src/services/opd.ts`, `packages/domain/src/opd/slot-optimizer.ts`).
  - Verified real tables (`opd_appointment_slot`, `opd_waitlist_entry`, `opd_slot_event` in `0011_v4_oncology_enhancement.sql` and `0012_opd_transaction_safety.sql`) and real paths (`packages/db/src/services/opd-flow.ts`, `packages/domain/src/flow/slot-optimizer.ts`).
- [x] **2.3 Reconcile Discrepancy C — Consultation Readiness & OCR Modules**
  - Corrected fabricated paths (`configured-ocr.ts`, `review/longitudinal-review.ts`, `review/lab-flowsheet.ts`, `ChangesSinceLastVisitCard.tsx`, `ReadinessChecklistCard.tsx`, `FilterChips.tsx`, `OpdFlowWorkspace.tsx`, `ingestion/bundle-ingest.ts`) to actual repository paths (`ocr-routing.ts`, `journey/longitudinal-review.ts`, `ChangesSinceLastVisitBanner.tsx`, `GuidedReadinessBanner.tsx`, `LongitudinalLabFlowsheet.tsx`, `MedicationHistoryView.tsx`, `BatchVerificationModal.tsx`, `EvidenceViewContainer.tsx`, `OpdWorkspace.tsx`, `fhir/standard-bundles.ts`).
- [x] **2.4 Reconcile Discrepancy D — Synthetic Oncology Demonstration Patients (`DEMO-001`..`DEMO-003`)**
  - Corrected false patient descriptions (`St. Jude T-ALL`, `TMC Breast`, `Apollo Lung`) in `v4-release-readiness-audit.md` to actual `packages/db/src/fixtures.ts` and `seed.ts` records:
    - `DEMO-001 — Fragmented referral` (`SUN-448120` / `RCI-2025-0031`, Breast IDC grade 2, `pT2N1M0`, 10 documents across 4 synthetic facilities, surgery date conflict `12 June 2025` vs `3 July 2025`).
    - `DEMO-002 — Staleness` (`RCI-2025-0044`, Medical oncology Paclitaxel + Carboplatin Cycle 1 follow-up, 5 documents, reopened appointment conflict `15 July 2025` vs `22 July 2025`).
    - `DEMO-003 — Ready` (`READY-1001`, Post-treatment breast/radiation surveillance, `pT1N0M0`, `50 Gy in 25 fractions`, 9 documents, all facts verified, ready band).
  - Relabeled sample FHIR interoperability bundle UI badge in `DocumentUploadForm.tsx` to `Synthetic Demo Fixture — Standard Ingest` so synthetic bundles never imply genuine institutional provenance.
- [x] **2.5 Reconcile Discrepancy E — Real vs Simulated Integrations**
  - Classified every integration accurately as `WORKING LOCALLY`, `SIMULATED`, `EXTERNAL INTEGRATION VERIFIED`, or `NOT IMPLEMENTED` (noting `apps/extension` is `NOT IMPLEMENTED`).
- [x] **2.6 Reconcile Discrepancy F — Remove Unsupported Regulatory & Clinical Certification Claims**
  - Replaced all "CERTIFIED", "HIPAA certified", "DPDP compliant", "clinically certified", and "production ready" language with exact technical descriptions of implemented controls.

---

## 3. TDD Remediation of Verified P0 & P1 Defects (`RED -> GREEN -> REFACTOR -> VERIFY`)

- [x] **3.1 [P0-1] Studio & Packet Source Withdrawal Enforcement + Canonical Studio Approval Hash + Scoped FHIR Export**
  - **RED**: Added regression tests in `packages/db/test/studio.test.ts` for canonical approval payload hashing and blocking approval/export when a cited fact's source document has `ingest_error = 'consent_revoked_or_expired'`.
  - **GREEN**:
    - Added `assertStudioArtifactSourcesAccessible` in `packages/db/src/services/studio.ts` and wired it into `approveStudioArtifact` and `GET /api/v1/studio/[artifactId]/export`.
    - Updated `approveStudioArtifact` to hash `{ markdownBody, citedFactIds, citedGuidelineIds, approvedBy, approvedAt }` with SHA-256 per ADR 0024.
    - Scoped `GET /api/v1/studio/[artifactId]/export?format=abdm|mcode` strictly to `artifact.citedFactIds` and redacted `patientName` when `artifact.isDeidentified === true`.
    - Added `assertPacketSourcesAccessible` in `packages/db/src/services/packets.ts` and wired it into `getPacketExportBundle` and `GET /api/v1/packets/[packetId]/export`.
- [x] **3.2 [P0-2] Studio Claim Grounding & Patient Handout Fallback Safety**
  - **RED**: Added regression tests in `packages/domain/test/studio-safety-audit.test.ts` verifying that `patient_info_sheet` never invents unanchored bring-list items when `instructions.length === 0`, that open `conflicting` facts are excluded from verified claims, and that `revalidateStudioMarkdownCitations` rejects tampered numeric lab values and autonomous directives even when `[E#]` tags remain attached.
  - **GREEN**: Updated `generateStudioDraft` and `revalidateStudioMarkdownCitations` in `packages/domain/src/studio/draft-generator.ts` and `approveStudioArtifactAction` in `apps/web/src/lib/actions.ts`.
- [x] **3.3 [P0-3] Audio Generation RBAC Authorization & 11-Locale Allow-List Validation**
  - **RED**: Added unit tests in `apps/web/src/lib/phase5-continuity-voice.test.ts` testing unauthenticated (`401`) and unsupported locale (`400 unsupported_language_code`) requests on `POST /api/v1/assistant/voice/tts`.
  - **GREEN**: Added `can(session.role, 'patient:read')` and `ALLOWED_LOCALE_CODES` validation in `apps/web/src/app/api/v1/assistant/voice/tts/route.ts` (shared by `/api/v1/continuity/tts`).
- [x] **3.4 [P0-4] Caregiver Revocation Enforcement in `deliverMessage` & Audit Redaction Hardening**
  - **RED**: Added regression test in `packages/db/test/caregivers.test.ts` proving `deliverMessage` dispatches to active consented caregivers (`syncReminders: true`) and dispatches `0` messages after `revokeCaregiverConsent`. Added redaction tests in `packages/db/test/audit-redaction.test.ts`.
  - **GREEN**: Updated `deliverMessage` in `packages/db/src/services/messages.ts` to query `caregiver_contact WHERE org_id = $1 AND patient_id = $2 AND is_active = true AND revoked_at IS NULL AND sync_reminders = true` and expanded `REDACT_KEYS` in `packages/db/src/services/audit.ts`.
- [x] **3.5 [P1-1] Patient Audit Trail Coverage for Studio, Caregiver, and OPD Actions**
  - **RED**: Added regression test in `packages/db/test/audit-redaction.test.ts` asserting `listPatientAudit` includes `studio.draft_created` and `caregiver.registered` events for the patient.
  - **GREEN**: Added `studio_artifact`, `caregiver_contact`, `opd_appointment_slot`, and `opd_waitlist_entry` to the `UNION` subquery in `listPatientAudit` (`packages/db/src/services/patients.ts`).
- [x] **3.6 [P1-2] Batch Verification Modal E2E Selector Alignment & Safe Demo Preparation Procedure**
  - Aligned `phase2-consultation-readiness.spec.ts` with `open-batch-verify-btn` and `confirm-batch-verify-btn`.
  - Created `tools/prepare-demo.ts` and `pnpm demo:prepare` script in `package.json`.

---

## 4. Documentation & Judging Deliverables Checklist

- [x] `docs/superpowers/plans/2026-10-24-v4-release-candidate-audit.md` (this execution plan & checklist)
- [ ] `docs/v4-final-code-audit.md` (truthful reconciliation of previous audit vs real code, full requirements matrix, security/clinical safety review, and defect log)
- [ ] `docs/v4-release-candidate-verification.md` (test execution evidence, database state verification, integration truth table, and residual limitations)
- [ ] `docs/v4-judge-demo-runbook.md` (10-scene step-by-step live demo script with exact logins, clicks, expected outputs, talking points, and contingency recovery)
- [ ] `docs/v4-judge-presentation-outline.md` (10-slide deck structure with speaker notes, timing budget, and visual proof mapping)
- [ ] `docs/v4-judge-technical-defense.md` (concise, evidence-backed Q&A responses for clinical and technical judges)
