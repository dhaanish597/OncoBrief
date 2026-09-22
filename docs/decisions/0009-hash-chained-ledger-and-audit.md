# 0009 — Hash-chained ledger and audit streams

**Status:** Accepted
**Date:** 2026-09-22

## Context

`CLAUDE.md` requires audit logging and that every important state change record
actor, timestamp, action and reason. ADR 0002 already removes `UPDATE` and
`DELETE` grants from the application role, which stops the application from
rewriting history.

That leaves a gap: a direct database write — an insider, a compromised
connection, a careless migration run as the migrator role — could still alter
or delete past entries, and nothing would reveal it. For a product whose claim
is *"here is a trustworthy record of every human decision"*, undetectable
tampering is the failure that matters most.

## Decision

Two separate append-only streams, each hash-chained.

**`ledger_entry`** answers *"what does the record believe, and why?"* — evidence
facts only, consumed by domain logic, the timeline and packets.
**`audit_event`** answers *"who did what in this system?"* — every consequential
action plus sensitive reads, consumed by security review and incident response.

They are kept separate because they have different consumers, different
retention needs and different PHI exposure. Conflating them would force the
security log to carry clinical content.

Both chain identically:

```
entry_hash = sha256(
  coalesce(prev_entry_hash, '\x00') ||
  canonical_json({ ...the entry's semantic fields... }))
```

Canonical JSON means sorted keys, no insignificant whitespace, RFC 3339
timestamps — so the hash is reproducible across languages and library versions.

`seq` is a gap-free monotonic counter per org, allocated inside the same
transaction as the insert via `SELECT ... FOR UPDATE` on a per-org counter row.
Gap-free ordering is what makes a deletion detectable: a missing `seq` is as
visible as a broken hash.

`GET /api/v1/ledger/verify` recomputes both chains and reports the first
divergence. The demo ends on this endpoint returning green (step 19).

**PHI never enters `audit_event`.** `metadata_json` is written through a
redaction helper that strips document text, verbatim quotes and patient names.
The audit log records *that* page 3 of document X was viewed, never what it
said.

`outcome = 'denied'` events are recorded as carefully as successes — an RBAC or
RLS refusal with the attempted `entity_id` is the signal for a tenant-escape
attempt.

## Alternatives considered

**No chaining; rely on `REVOKE` alone.** Rejected: stops the application, not a
direct database write. Tampering would be undetectable.

**Blockchain / distributed ledger.** Rejected: enormous operational cost for a
prototype, and it solves multi-party trustlessness — a problem this product
does not have. A hash chain gives the tamper-evidence without any of it.

**Signed entries with an asymmetric key.** Rejected for this window: requires
key management infrastructure that does not exist here. It would upgrade
tamper-*evidence* to tamper-*attribution*, which is a reasonable pilot
improvement and should get its own record.

**One combined stream.** Rejected: forces the security log to carry clinical
content, and makes retention and access policy impossible to separate. The
`auditor` role can read `audit_event` precisely because it holds no PHI.

**External append-only log service (CloudTrail-style).** Rejected: offline demo,
and it moves the trust boundary rather than removing it.

## Consequences

**Positive.** Any modification or deletion of a past entry breaks the chain and
is detected by a single endpoint. The verification result is a compelling and
honest closing beat for the demo — the final claim is *"here is a tamper-evident
record of every human decision"*, not *"our AI is accurate"*. Cheap:
one SHA-256 per write. The audit stream is safe to expose to a read-only
`auditor` role because redaction keeps PHI out of it.

**Negative.** Entry construction must be strictly serialised per org, so the
`FOR UPDATE` counter row is a write bottleneck (irrelevant at prototype volume,
a real consideration at pilot scale). Canonical JSON must be byte-stable
forever — a change to the serialiser invalidates every prior hash, so the
canonicaliser needs its own regression test with frozen fixtures. Verification
is O(n) over entries; it will need checkpointing eventually.

**Negative, and stated rather than hidden.** A database-superuser compromise
can rewrite entries *and* re-chain them, leaving verification green. The only
real defence is anchoring hashes off-box, which is out of scope for this
window. This residual risk is recorded in architecture §24 (threat T3) and as
unresolved decision U8 — it is documented, not mitigated, and must not be
described as solved.
