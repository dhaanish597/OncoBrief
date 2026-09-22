# 0002 — Append-only Evidence Ledger with rebuildable projections

**Status:** Accepted
**Date:** 2026-09-22

## Context

`AGENTS.md`: *"The timeline is a view over the Evidence Ledger. The Evidence
Ledger is the source of truth."* `CLAUDE.md`: *"Never silently overwrite source
evidence. Corrections must preserve the original extracted value."*

Most record systems store a mutable current value and a separate change log.
That arrangement makes the log advisory — it can drift from the data, and a bug
or a careless migration silently rewrites history. For a product whose entire
claim is provenance, an advisory audit trail is worthless.

## Decision

Separate three concerns that are usually conflated:

1. **`evidence_fact`** — the immutable claim. Never `UPDATE`d.
2. **`ledger_entry`** — the append-only, hash-chained event stream. Insert-only.
3. **`evidence_state`**, **`timeline_event`** — projections. Derived,
   rebuildable, never authoritative.

Enforcement is at the database, not in application code:

```sql
REVOKE UPDATE, DELETE ON evidence_fact  FROM oncobrief_app;
REVOKE UPDATE, DELETE ON ledger_entry   FROM oncobrief_app;
REVOKE UPDATE, DELETE ON audit_event    FROM oncobrief_app;
```

DDL rights belong to a separate `oncobrief_migrator` role.

A correction is one transaction, two facts, two entries: a new
`evidence_fact` with `corrects_fact_id → original`, a `fact_corrected` entry
marking the original `corrected`, and a `fact_verified` entry for the
replacement. The original is never touched.

A property test generates random legal action sequences, truncates the
projections, replays `ledger_entry`, and asserts byte-identical results. The
timeline being a projection is therefore a tested invariant rather than a
stated intention.

## Alternatives considered

**Mutable current-value tables plus an audit log.** Rejected: the log becomes
advisory, drift is undetectable, and "never overwrite" degrades to a code
convention that one bad migration breaks.

**Full CQRS/event sourcing with a separate event store and async projectors.**
Rejected: eventual consistency would be visible in the demo (verify a fact, see
a stale badge), and it adds infrastructure the brief forbids without
justification. Projections are written in the same transaction as the append.

**Temporal tables / `pg_audit` / row versioning via triggers.** Rejected:
captures *that* a row changed but not the domain meaning — which reviewer took
which action for which reason. The ledger's `action`, `actor`, `reason` and
state pair are domain facts, not diffs.

**Soft deletes with `is_current` flags.** Rejected: still permits `UPDATE`, so
the guarantee remains a convention.

## Consequences

**Positive.** "Never overwrite source evidence" becomes a property of the schema
that a compromised handler cannot violate. Full history is queryable by
construction. Corrections keep both values, which the UI shows as
"corrected from «original»". Projections can be dropped and rebuilt, so a
projection bug is repairable without data loss.

**Negative.** Reads require joining the projection to facts, and every state
change is an insert plus a projection write. Storage grows monotonically — no
row is ever reclaimed. Mistakes cannot be deleted, only compensated by a new
appended action (`fact_reinstated` exists for exactly this), so operators must
be comfortable with a visible history of their own errors. Mutating endpoints
need `Idempotency-Key` handling, because a double-submitted verification would
otherwise be permanently recorded twice.

**Neutral.** Data-erasure requests (DPDP Act) would need a documented
crypto-shredding or tombstone strategy. Out of scope for the prototype and
recorded as a gap in architecture §24.
