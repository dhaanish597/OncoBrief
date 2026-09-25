# OncoBrief — Evidence Ledger

The ledger separates three things most systems conflate: the **claim**
(immutable), the **event** (append-only) and the **current state** (derived).
The timeline is a projection over the ledger; the ledger is the source of truth.

## Tables

| Table | Role |
|---|---|
| `evidence_fact` | The immutable claim. `REVOKE UPDATE, DELETE` plus a row trigger. |
| `evidence_span_link` | Fact → OCR span anchors. |
| `ledger_entry` | Append-only, hash-chained event stream, monotonic `seq` per org. |
| `evidence_state` | Maintained projection of current state. Rebuildable. |
| `timeline_event` | Maintained projection for the timeline view. Rebuildable. |
| `extraction_candidate` | Every proposed fact, including rejected ones. Append-only. |
| `audit_event` | Separate hash-chained stream for actor actions. |
| `document_ingestion_job` | Worker idempotency/retry state (ADR 0015). |
| `packet_event` | Append-only consultation-packet lifecycle stream. |

## States

`extracted`, `verified`, `conflicting`, `corrected`, `rejected`, `superseded`.

The transition guard (`packages/domain/src/evidence/transitions.ts`) is a single
total function. Every legal transition and every illegal combination is a unit
test. The guard also enforces human-only verification/correction/rejection and
conflict resolution, and minimum reason lengths.

## Provenance — every displayed fact

`GET /api/v1/evidence/{id}` returns: fact type, value, the exact
`verbatim_quote`, page number, normalized bounding boxes, the extracting
engine/model and version, the confidence band, the document version and
SHA-256, correction lineage, and the ledger history. No evidence, no timeline
event: a fact cannot exist without a span anchor because `insertFact` runs
`validateSpans` before writing.

## The promoter

Extractors (rule-based or LLM) write `extraction_candidate`. Only the
deterministic promoter writes the ledger:

1. concatenate the linked spans' text;
2. normalise both sides identically (NFKC, whitespace, dashes);
3. assert the quote is a contiguous substring;
4. assert one document and one page;
5. check the fact type against the closed vocabulary;
6. compute `slot_key`, map confidence to a band.

A fabricated quote has no anchor and is rejected mechanically. Rejected
candidates are retained and counted — that ratio is the honest, self-measured
safety statistic.

## Corrections preserve the original

A correction inserts a **new** fact with `corrects_fact_id` pointing at the
original and moves the original to `corrected`. The original row and its value
are never touched; both are returned by the provenance API.

## Conflicts

Detection is deterministic (`packages/domain/src/conflict`): same patient, same
`slot_key`, incompatible explicit values. The LLM is never used to resolve a
conflict. Resolution is human-only with three outcomes (`retain_both`,
`mark_superseded`, `corrected`) and a mandatory reason, enforced by a database
`CHECK`.

## Verification

```sql
SELECT rebuild_evidence_state('<org>');
SELECT rebuild_timeline('<org>');
```

Dropping and rebuilding both projections from `ledger_entry` must be a no-op;
`packages/db/test/ledger.test.ts` asserts this.

## Append-only guarantee

`REVOKE UPDATE, DELETE` from `oncobrief_app`, plus a `BEFORE UPDATE OR DELETE`
trigger that raises even for a role holding the grant. The only way to change
what the system believes is to append.
