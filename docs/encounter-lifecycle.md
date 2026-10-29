# OncoBrief — Consultation & Encounter Lifecycle Architecture

## 1. Overview & Non-Diagnostic Clinical Boundary

The consultation encounter represents the point of care where oncology clinicians interact with patients, review evidence, document assessments, and coordinate care continuity.

### The Non-Diagnostic Principle
In accordance with OncoBrief's founding safety rules:
- **Human Clinical Authorship**: All clinical impressions, TNM staging formulations, histology confirmations, and treatment regimens are authored, signed, and attested by licensed oncology physicians.
- **AI Assistive Role**: OncoBrief provides high-fidelity evidence retrieval, source document citations, OCR verification, and structured note templating. It **never** autonomously infers medical diagnoses, predicts disease progression, or prescribes pharmacological treatments.
- **Audited Note Revisions**: Clinician documentation follows an immutable revision model (`draft` -> `finalized` -> `amended`). Once signed, a note cannot be silently edited; corrections produce a new version (`version + 1`) citing a documented amendment reason.

---

## 2. Encounter Schema & Versioned Notes

Defined in `packages/db/migrations/0019_oncology_operations_milestone_b.sql`:

### `encounter`
- `id` (UUID, PK)
- `org_id` (UUID, tenant boundary)
- `patient_id` (UUID, FK -> `patient`)
- `appointment_id` (UUID, optional link to origin appointment)
- `clinician_id` (UUID, primary attending clinician)
- `encounter_type` (`outpatient`, `inpatient`, `daycare_chemo`, `radiation_session`, `teleconsult`, `emergency`)
- `status` (`in_progress`, `completed`, `cancelled`, `amended`)
- `started_at`, `completed_at` (TIMESTAMPTZ)

### `encounter_participant`
Tracks multidisciplinary presence during consultations:
- `id`, `encounter_id`, `user_id`, `role` (`attending`, `fellow`, `resident`, `nurse`, `observer`, `consultant`), `joined_at`

### `encounter_note_version`
Captures versioned professional clinical notes:
- `id` (UUID, PK)
- `encounter_id` (UUID, FK -> `encounter`)
- `version` (INT, 1, 2, 3...)
- `status` (`draft`, `finalized`, `amended`)
- `title` (VARCHAR(160), e.g., "Post-Operative Histopathology Review")
- `chief_complaint` (TEXT)
- `history_present_illness` (TEXT)
- `clinical_assessment` (TEXT, human-authored clinical staging & impression)
- `plan_and_instructions` (TEXT, treatment recommendations & next steps)
- `follow_up_instructions` (TEXT)
- `authored_by` (UUID, FK -> `app_user`)
- `finalized_by`, `finalized_at` (UUID & TIMESTAMPTZ, cryptographic timestamp of clinical sign-off)
- `amendment_reason` (TEXT, required for `amended` status)

---

## 3. Consultation Room UX (`/patients/[id]/encounters/[encounterId]`)

The Consultation Room presents a side-by-side cockpit designed specifically for oncologists:

1. **Header & Context**:
   - Patient name, MRN, encounter status badge, encounter start time.
   - Primary clinician, hospital facility, and oncology department.
   - Immediate "Complete Encounter" action button for attending clinicians.
2. **Left Column — Verified Evidence Ledger**:
   - Live stream of all source-verified facts for the patient from the append-only ledger.
   - Cites issuing facility, document title, and exact page number.
   - "Inspect source" link opens the source document viewer alongside the consultation.
3. **Right Column — Note Authoring & Signing**:
   - **Draft Mode**: Clean form for Chief Complaint, History of Present Illness, Clinical Assessment, Plan & Instructions, and Follow-up Instructions.
   - **Signed Mode**: Displays the finalized note with signer name, license attestation, and signature timestamp.
   - **Amendment Mode**: Expanding accordion allows authoring Version 2+ with mandatory `amendmentReason`.
4. **Care-Coordination Task Handoff**:
   - Integrated form to generate administrative tasks directly anchored to the encounter (`originKind = 'encounter'`).
   - Enables instant assignment of document retrieval, prior authorization, or specialized radiology scheduling to care coordinators.
