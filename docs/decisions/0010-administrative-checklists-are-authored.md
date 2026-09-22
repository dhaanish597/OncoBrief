# 0010 — Administrative checklists are human-authored, never inferred

**Status:** Accepted
**Date:** 2026-09-22

## Context

The Administrative Digital Twin must answer "what documents are missing?", and
missing-document detection is the primary safety claim — research §3.5 notes
omission rates in record summarisation are frequently *higher* than
hallucination rates, so tracking omission is where the differentiation is.

But "what is missing" is one short step from "what does this patient need", and
that step crosses the line. `CLAUDE.md` forbids inferred medical requirements,
treatment recommendation and clinical decision support. A system that concluded
*"a patient with this diagnosis should have a PET scan, and there isn't one"*
would be doing clinical reasoning, however administratively it were phrased.

The distinction is real and worth stating precisely. *"A new-patient intake
packet at this hospital administratively requires an insurance authorization
letter"* is a records-office rule. *"This patient needs a PET scan"* is a
clinical judgement. The first is safe; the second is out of bounds. Nothing in
the data model should be able to express the second.

## Decision

Requirements come exclusively from **human-authored, versioned
`checklist_template` records**. No LLM generates a requirement. No rule infers
one from a diagnosis, a stage, or any other clinical content.

- `checklist_item` carries a mandatory `rationale` — an authored administrative
  justification, so every requirement can be defended by the person who wrote
  it.
- `requirement_kind` is `required | expected | optional`.
- Templates are keyed on `care_context` (e.g. `new_patient_intake`) — an
  administrative workflow stage, **never** a clinical condition. There is no
  `diagnosis` or `stage` column on a template, so a condition-driven
  requirement has nowhere to live.
- `patient_checklist` pins `(template_id, template_version)`, so editing a
  template later cannot retroactively change what a patient's record was
  measured against.
- Authoring requires `checklist:author` — `records_officer` or `org_admin`
  only. Clinicians and coordinators cannot author requirements.
- Gap evaluation is a pure function
  `evaluateGaps(checklistItems, documents) → RecordGap[]`: deterministic, no
  model, exhaustively testable.
- Waiving a gap requires a human actor and a reason, enforced by a DB `CHECK`.

## Alternatives considered

**Infer required documents from extracted clinical content.** Rejected: this is
inferring medical requirements, explicitly forbidden. It is also the most
tempting option, because it demos well — which is exactly why it needs a
decision record saying no.

**LLM-generated checklists per patient.** Rejected: non-deterministic, unciteable
requirements, and it would place clinical reasoning in the critical path of an
administrative feature.

**One hardcoded global checklist.** Rejected: different hospitals have genuinely
different records requirements, and hardcoding would make the twin a demo prop
rather than a configurable operational tool.

**Unversioned, editable templates.** Rejected: an edit would silently change
every historical patient's gap set, so an audit of "why was this marked
incomplete in March" could not be answered. Version pinning makes the past
stable.

## Consequences

**Positive.** Omission becomes a first-class, queryable entity (`record_gap`)
rather than a rendered count — so a missing document can be the **source link
on a task**, which turns "the record is incomplete" into "someone is retrieving
it by Thursday". The non-clinical boundary is preserved structurally: there is
no schema slot in which a condition-driven requirement could be stored. Every
gap is explainable by pointing at an authored rule with a rationale and a
version. The readiness band is explainable by enumeration.

**Negative.** Templates must be authored before the twin says anything useful,
so seeding realistic ones is real setup work and a prerequisite for the demo.
Checklists are coarser than clinical reality — they cannot express
patient-specific needs, and they will sometimes flag a document that a
particular patient genuinely does not need. That is the correct trade: a
false "missing" is a records-office conversation, whereas an inferred medical
requirement is a boundary violation.

**Neutral.** Waivers are the escape hatch for coarseness, and they carry a
mandatory reason, so the pattern of waivers becomes useful feedback on
template quality.
