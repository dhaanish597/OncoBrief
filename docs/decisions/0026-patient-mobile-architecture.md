# 0026 — Patient Mobile Architecture (Dual-Mode Connected & Offline Synthetic Companion)

**Status:** Accepted  
**Date:** 2026-10-28 (Renumbered & Amended 2026-11-01 to resolve BUG-MOB-14 collision with ADR 0017)

## Context

OncoBrief is an evidence-first oncology record-readiness and care-continuity platform. The original prototype established the clinician web portal and immutable Evidence Ledger (ADRs 0001–0016), followed by ABDM V3 integration (ADR 0017), consent revocation governance (ADR 0018), longitudinal observations (ADR 0019), consultation readiness (ADR 0022), and clinician-caregiver voice continuity (ADR 0025).

A patient mobile companion is required for oncology patients and family caregivers to review source-grounded consultation records, prepare for upcoming oncologist visits, confirm appointment attendance, receive clinician-approved continuity instructions, and manage consented access. 

The original mobile design proposal was temporarily assigned identifier `0017` in the mobile branch, which collided with `0017-abdm-m2-m3-integration.md`. Furthermore, earlier uncommitted mobile routes allowed unverified client-selected identities and bypassed Row-Level Security. To preserve repository integrity and clinical safety, the mobile architecture is formally established under ADR 0026 with strict dual-mode isolation.

## Decision

Implement `apps/mobile` as a standalone React Native application powered by Expo (SDK 58), React 19, TypeScript, and Expo Router, operating under a formal dual-mode architecture:

### 1. Dual-Mode Architecture: Connected Hospital Mode vs. Offline Synthetic Demo Mode

The mobile application operates under two strictly isolated repository modes governed by a common typed repository interface (`PatientRepository`):

- **Connected Hospital Mode (`ConnectedPatientRepository`):**
  - Connects to OncoBrief backend via authenticated, patient-scoped `/api/v1/patient-portal/*` endpoints.
  - Authentication requires explicit patient verification via OTP (`POST /api/v1/patient-portal/session`) backed by rate limiting, HMAC-signed bearer session tokens, and cryptographic session expiration.
  - All database interactions enforce PostgreSQL Row-Level Security (`ENABLE + FORCE ROW LEVEL SECURITY`) on all patient-portal tables, ensuring zero cross-patient or cross-hospital data leakage.
  - Offline changes are queued in a deterministic, FIFO `OfflineSyncQueue` with idempotency keys and exponential backoff.

- **Offline Synthetic Demo Mode (`DemoRepository`):**
  - Enables standalone, zero-network demonstrations without live hospital infrastructure.
  - Employs deterministic, synthetic oncology patient personas (`DEMO-001` Meenakshi Sundaram — Breast Cancer Stage IIA; `DEMO-002` Rajeshwari Nair — Ovarian Cancer Stage IIIB; `DEMO-003` Arjun Kulkarni — Colon Cancer Stage IIIB).
  - Explicit demo status is prominently watermarked across all screens.
  - Synthetic demo data is completely isolated from production pipelines and cannot interact with real hospital networks.

### 2. Evidence Ledger as Clinical Source of Truth

- The Evidence Ledger is the immutable source of truth for all clinical facts. The mobile timeline, lab observations, and visit histories are strictly rebuildable projections over ledger events.
- Every displayed clinical fact must trace to verifiable source provenance (source facility, document ID, page, text span/coordinates, and SHA-256 prefix).
- Discrepancies and contradictory records preserve both source values without silent resolution, flagging reconciliation tasks for human oncologist review.

### 3. Strict Clinical Safety & Non-Diagnostic Boundary

- In accordance with `CLAUDE.md`, `AGENTS.md`, and ADR 0001, the mobile application maintains a strict **non-diagnostic clinical boundary**.
- Under no circumstances shall the mobile application provide automated triage, clinical diagnosis, cancer staging inference, prognosis scoring, or treatment recommendations.
- Lab values are presented verbatim with source-supplied reference intervals. The application strictly prohibits classifying values into normative evaluative categories (`below`, `within`, `above`) or displaying visual normal/abnormal range gauges.
- Patient wellbeing logs and symptom checklists are purely patient-reported administrative self-entries; they are never interpreted as clinical emergency monitors or risk scores.

### 4. Separation of Patient Review and Clinician Verification

- Patient interactions (e.g. marking a document as reviewed, flagging a missing page, or reporting a date discrepancy) produce patient-scoped review records (`patient_document_review`, `patient_discrepancy_flag`).
- Patient review can **never** confer clinician verification or modify `document.status = 'verified'`.
- All patient-flagged discrepancies atomically spawn reconciliation tasks categorized for human clinical review.

### 5. Source-Grounded Administrative Data & Patient Preparation

- Patient consultation preparation allows patients to author questions, select pack items, and organize outside records.
- Optional preparation items (e.g., check `c4`) and pack/share selections operate with dedicated, non-overlapping state scopes (`packSelected` vs `shareSelected`).
- Continuity instructions delivered to the patient mobile feed must be clinician-approved (`continuity_message.status = 'approved'`). Unapproved draft messages are never visible.

### 6. Consent, Privacy & Cryptographic Storage

- First application launch enforces an explicit, blocking informed consent gate (`/onboarding`).
- Persisted local storage utilizes authenticated AES-256-GCM encryption with keys secured via `expo-secure-store` on native Android and isolated `localStorage` in browser environments. Plaintext PHI on disk is strictly forbidden.
- Patient audit streams are bounded and hash-chained to prevent unbounded disk growth and ensure tamper-evidence.
- Native Android runtime security includes `FLAG_SECURE` screen capture protection and app-switcher privacy overlays to prevent visual data leakage in multitasking views.
- Consent revocation guarantees immediate cryptographic erasure of locally cached clinical data.

### 7. Native Android Runtime Validation

- Implementation mandates verification across multiple tiers: unit/domain logic, browser E2E continuity, Hermes bytecode export (`expo export --platform android`), native Android Gradle compilation (`./gradlew assembleDebug`), and live USB-debugged native device installation (`adb install -r`) with native smoke verification.

## Consequences

- **Safety:** Prevents clinical misinterpretation by patients while providing transparent, provenance-backed visibility into oncology records.
- **Security:** Guarantees cryptographic data protection, zero cross-patient leakage via FORCE RLS, and clean separation between synthetic demo data and live hospital data.
- **Repository Hygiene:** Resolves the `0017` ADR number collision (`BUG-MOB-14`) and aligns documentation with the actual sequentially numbered ADR catalog (0001–0026).
- **Extensibility:** Enables both offline evaluation at hackathon demonstration venues and production integration with hospital OPD systems.
