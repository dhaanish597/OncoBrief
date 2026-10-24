# 0019 — Source-dated longitudinal observations and read-only interval review

Status: Accepted. Date: 2026-10-23.

## Context

Phase 1 adds pending investigation, documented instruction and vital-sign fact
vocabularies. The prior lab comparator already exempted distinct dates but its
slot-wide conflict membership could flag unrelated observations. Medication
comparison ignored documented doses. The plan inconsistently specifies a
one-day tolerance and distinct calendar-day grouping.

## Decision

Use distinct valid source calendar dates as separate observations, including
adjacent days. Compare same-day values/dose text deterministically. Invalid or
one-sided dates return `incomparable`; different undated values still disagree.
Matching undated lab text retains the existing textual-agreement contract; it
never establishes an observation date or a current clinical state. Missing dose
text is unknown. Same-day differing units remain incomparable; no conversion.

New persisted longitudinal slots include source dates. Immutable historical
slot keys are preserved. Detection derives the base comparison group on read
and creates conflict components only from disagreement/incomparable edges, so
unrelated serial facts are not flagged. Historical conflicts are not silently
closed or rewritten; a human must review any pre-existing false conflicts.

The new pending/instruction types use the existing `text` value shape. Vital
signs reuse the verbatim `lab` measurement shape, with no range, risk, severity
or interpretation fields. Pending/bring instructions are not labelled as
completed procedures. Controlled oncology terms remain transcriptions only.
Extracted drug doses are included in their exact supporting quote. Explicit
report/collection dates can supply observation dates on the same page; upload
time never does. Ambiguous multiple page dates remain unknown.

`journey/longitudinal-review.ts` is pure domain logic; the database service is a
read model over facts, source links, states and ledger changes. Interval changes
consider source observation dates, document ingestion, fact creation and ledger
updates. A recorded last consultation date is an exclusive calendar-day
boundary; an approved packet timestamp and ledger sequence are the fallback.
Open newly detected/reopened conflict IDs are deduplicated. Existing pending
items remain visible without declaring them clinically unmet or resolved.

Lab and medication points retain fact/document/page/quote/state. Undated points
remain undated. Arithmetic uses full numeric tokens and identical stated units;
multiple values on a recent date, conflicts, censored/nonnumeric values and
replaced/rejected/superseded evidence suppress arithmetic. Medication history
never infers an active or discontinued regimen.

## Alternatives

- Treat values on every date as competing truths: false reconciliation work.
- Rewrite old ledger slots or close old conflicts automatically: breaks audit
  history and human authority.
- Render a generated clinical summary: unnecessary and outside the safety scope.

## Consequences and security assumptions

No new inference, action approval bypass, endpoint, or UI is introduced. The
existing promotion/span gate and packet unverified-state labels remain in use.
Read callers must establish authenticated tenant context and appropriate RBAC,
just as for `getTimeline`; SQL parameters and forced RLS scope the read. Consent
withdrawal source SELECT policies continue to filter facts and provenance.
This foundation is ready for Phase 2 views; it does not implement them.
