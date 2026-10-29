# OncoBrief — Care Coordination & Administrative Task Lifecycle

## 1. Care Coordination Mission

Cancer care is inherently cross-functional, involving medical oncologists, surgical oncologists, radiation oncologists, radiologists, pathologists, care coordinators, and medical records officers.

To ensure that critical diagnostic gaps, missing records, and conflicting reports do not cause treatment delays, OncoBrief provides an administrative task management system integrated directly into clinical workflows.

---

## 2. Closed Task Vocabulary & Provenance

In strict alignment with clinical boundaries, task types are closed to administrative and operational coordination. OncoBrief **never** permits tasks that infer medical requirements (such as "order biopsy" or "escalate urgent chemotherapy").

### Permitted Task Kinds (`TASK_KINDS`)
- `retrieve_document`: Request missing clinical report from outside institution.
- `clarify_with_facility`: Contact external lab or imaging center to resolve report discrepancies.
- `confirm_identifier`: Reconcile ambiguous patient demographics, UHID, or ABHA address.
- `request_authorization`: Process insurance prior-authorization for planned oncology therapies.
- `schedule_appointment_followup`: Coordinate next appointment or multidisciplinary clinic session.
- `obtain_consent_form`: Gather signed consent documentation for procedures or clinical trials.
- `resolve_duplicate`: Merge duplicate external record imports.
- `verify_evidence_batch`: Authorize records officer review for pending OCR extractions.

### Origin Kinds (`TASK_ORIGIN_KINDS`)
Tasks in OncoBrief always maintain strict provenance back to the trigger that necessitated them:
- `evidence`: Triggered by unverified or flagged OCR findings.
- `record_gap`: Triggered by missing checklist items in the NCG clinical record readiness map.
- `conflict`: Triggered by detected contradictions between two clinical documents.
- `document`: Triggered during document intake or OCR processing.
- `encounter`: Created directly by an oncologist during a live consultation encounter.

---

## 3. Cross-Patient Worklist (`/my-tasks`)

The `/my-tasks` command center provides care coordinators and oncology staff with unified operational visibility:
- **Scope Toggle**: Switch seamlessly between `My Assigned Tasks` (filtered to the authenticated user's ID) and `All Team Tasks`.
- **Status Filter**: Filter by `Open Only` (`open`, `assigned`, `in_progress`, `blocked`), `All Tasks`, or specific statuses.
- **Kind Filter**: Filter by task category (`retrieve_document`, `schedule_appointment_followup`, etc.).
- **Inline Status Actions**: Transition tasks through their lifecycle (`In Progress`, `Blocked`, `Done`) with mandatory resolution notes upon completion.
- **Direct Navigation**: Clicks through to the patient profile (`/patients/[id]/tasks`) and consultation room.
