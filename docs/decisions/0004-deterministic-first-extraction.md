# 0004 — Deterministic-first extraction; the LLM proposes, it never writes

**Status:** Accepted
**Date:** 2026-09-22

## Context

`CLAUDE.md`: *"Do not use an LLM where deterministic code is sufficient…
source-grounded LLM output, structured outputs instead of free-form
generation."* The brief: *"Do not introduce autonomous agents merely because
the product uses AI."* Research §5.1: *"deterministic code where possible is
safer and cheaper than an agent for anything rule-based."*

No LLM credentials exist in this environment, so an LLM-dependent pipeline
could not be demonstrated at all.

The targets in Indian oncology documents — dates, MRN and ABHA identifiers,
facility names, document types, drug names, section headers — are
high-structure. Regex plus a controlled vocabulary beats a language model on
cost, latency, determinism and testability for all of them.

## Decision

**Extractors never write to the ledger.** They write `extraction_candidate`
rows. A deterministic **promoter** is the only code path that inserts
`evidence_fact`.

The promoter applies span validation (ADR 0003), checks `fact_type` against a
closed vocabulary, computes `slot_key`, maps `confidence_raw` to a
`confidence_band`, and only then opens the transaction that writes the fact,
its span links and a `fact_extracted` ledger entry. Facts always enter as
`extracted`, requiring human verification.

`RuleBasedExtractor` is the default and primary path. `LlmExtractor` is
opt-in via configuration and constrained to:

- **Structured output only.** A JSON schema requiring `fact_type` (enum),
  `value`, `verbatim_quote` and `span_ids` drawn from the supplied span list.
  The schema has no free-text response field.
- **Span-restricted input.** The prompt carries the page's spans with ids. The
  model selects; it does not transcribe from an image.
- **Fact-type allow-list.** Out-of-vocabulary types are rejected.
- **Document content as data, never instruction**, in a delimited block with
  explicit non-instruction framing.
- **No tool use, no loop, no planning.** One prompt, one structured response.

Permitted LLM uses are exhaustive: document-type suggestion (advisory until
human-confirmed), field extraction candidates, and translation of an approved
human-authored message template. Not permitted: prose summarisation, conflict
adjudication, task prioritisation, next-step suggestion, urgency assessment,
any medical interpretation.

Rejected candidates are **retained**, not discarded.

## Alternatives considered

**LLM writes evidence directly.** Rejected: a hallucination becomes a record
fact. The whole safety argument collapses.

**Agent framework (LangChain / "Hermes Agents") orchestrating extraction.**
Rejected explicitly by the brief, and unjustified on merit: the pipeline is a
fixed five-stage sequence, which is a state machine, not a planning problem.

**LLM-only extraction, no rules.** Rejected: no credentials, non-deterministic
tests, per-document cost, and worse accuracy on the high-structure fields that
matter most.

**Rules-only, no LLM path at all.** Rejected as the *permanent* answer: the
boundary itself is a deliverable, and a specified-but-unwired port is cheap.
Kept as the default path for this window.

## Consequences

**Positive.** The pipeline runs fully offline. Extraction is deterministic, so
tests are stable. Prompt injection has no action channel — the model's only
output is a candidate row, and candidates cannot set state (threat T4).
`extraction_candidate` becomes the measurement surface for the one statistic
worth quoting honestly: proposed → span-validated → human-verified, per
extractor version. Swapping extractors requires no ledger change.

**Negative.** Rule coverage is narrower than a good LLM's; unusual document
layouts yield fewer candidates, which shows up as omission rather than error.
Rules need maintenance per document type. The LLM boundary risks being claimed
but never exercised in this window (risk R9) — mitigated by making the
candidate counters visible with the rule-based extractor too.

**Neutral.** Precision is preferred over recall (unresolved decision U3). In a
provenance product a wrong extraction is worse than a missing one, and missing
ones are already tracked as gaps.
