# 0005 — Deterministic conflict detection, human-only resolution

**Status:** Accepted
**Date:** 2026-09-22

## Context

`CLAUDE.md` and `AGENTS.md` both state the rule absolutely: *"Never silently
resolve contradictions."* If two documents disagree, the system must preserve
both, show both, mark the evidence `conflicting` and require human resolution.

Research §3.4 identifies contradiction and staleness handling as a genuine
novelty axis — the incumbents (§2.2, Vizlitics/Cancer Insights) already do
source-grounded summarisation, so reconciliation is where the differentiation
actually is.

The tempting shortcuts are all wrong here: most-recent-document-wins,
highest-confidence-wins, and "let the model decide which is right." Each
invents a fact the record does not contain.

## Decision

**Detection is deterministic. Resolution is human-only. There is no
auto-resolve code path anywhere in the system.**

Grouping: facts are comparable only when they share `(patient_id, slot_key)`,
where `slot_key = fact_type + '|' + qualifier` is computed at extraction time
with a fact-type-specific qualifier defined in code.

Comparators are pure functions returning `agree | disagree | incomparable`:
exact normalised-text match; date equality with declared per-fact-type
tolerance; numeric equality within declared relative tolerance **and matching
units**; controlled-vocabulary equality for drugs and procedures.

`incomparable` is a deliberate third outcome. Mismatched units return
`incomparable`, not `disagree`. Incomparable pairs surface in the
reconciliation queue as *"needs human comparison"*. Treating "we cannot
compare these" as "these agree" would be exactly the omission failure mode
research §3.5 warns about.

Resolution maps to `CLAUDE.md`'s three outcomes:

- **`retain_both`** — both facts become `verified`, the conflict stays attached,
  and downstream consumers must render *"two sources disagree"*. Offered first
  in the UI, because "we do not know which is right" is a legitimate answer.
- **`mark_superseded`** — losers become `superseded`, winner `verified`.
- **`corrected`** — a new human-authored fact replaces the set.

All three require a reason, enforced by a DB `CHECK`
(`resolved_is_complete`). Detection is idempotent via
`UNIQUE (org_id, member_fingerprint)`.

Staleness lives here too: a `verified` fact can be pulled back into
`conflicting` when a later document disagrees. A verified fact is settled *as
of the documents seen so far*, not permanently.

## Alternatives considered

**Most-recent-document-wins.** Rejected: a re-faxed older report and a
mis-dated document both defeat it, and it silently discards a real
disagreement.

**Highest-confidence-wins.** Rejected: OCR confidence measures legibility, not
truth. A crisply-scanned wrong value beats a blurry right one.

**LLM adjudication.** Rejected: it would have the model invent a fact neither
document states, breaching both the non-clinical boundary and the
never-silently-resolve rule.

**Show a single value with a warning icon.** Rejected as a UI alternative:
showing one value implies a resolution the system has not made. Both values
render adjacently, with no default selection and no "recommended" badge.

**Auto-resolve with an audit entry.** Rejected: an audit trail of an automatic
decision is still an automatic decision.

## Consequences

**Positive.** The reconciliation room is the product's strongest demo moment
and its clearest differentiator. Conflicts are rows, so they can be counted,
assigned, blocked on, and included in the packet's mandatory `open_conflicts`
section. The `blocked` readiness band is explainable by enumeration. The
absence of a default selection in the UI is a legible design statement: the
system has no opinion.

**Negative.** Conflicts accumulate and need human time; a neglected queue
degrades readiness. Comparator tolerances are judgement calls that will need
tuning, and a badly-chosen tolerance produces either false conflicts (noise) or
missed ones (silence). Every fact type needs a comparator or its conflicts go
undetected — so the comparator registry must be exhaustive over the
`fact_type` vocabulary, asserted by a test.

**Neutral.** `retain_both` means some facts stay permanently conflicting, and
the packet must render them that way. This is correct behaviour, not a defect,
but it does require downstream consumers to handle multi-valued slots.
