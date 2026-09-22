# 0006 — Tenant isolation via PostgreSQL Row-Level Security

**Status:** Accepted
**Date:** 2026-09-22

## Context

`CLAUDE.md` requires least-privilege access, role-based access control and
tenant isolation. The product targets a multi-hospital setting (NCG-style
networks, per `cancer_track.md`), so hospital A must never see hospital B's
patients.

Application-level `WHERE org_id = ?` is the usual approach and it fails in the
usual way: one forgotten predicate on one query leaks every tenant's data, and
nothing in the system objects. The failure direction is wrong — the unsafe case
is the one that requires no effort.

## Decision

Shared schema, one `org_id` column on every tenant-scoped table, and
**forced** PostgreSQL Row-Level Security.

```sql
ALTER TABLE evidence_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_fact FORCE  ROW LEVEL SECURITY;   -- applies to the owner too

CREATE POLICY tenant_isolation ON evidence_fact
  USING      (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
```

Every request opens a transaction and issues
`SELECT set_config('app.org_id', $1, true)`. The third argument makes the
setting **transaction-local**, so a pooled connection cannot carry tenant
context into the next request.

`current_setting(..., true)` returns NULL when unset, and `org_id = NULL` is
never true — so **a forgotten `set_config` returns zero rows, not all rows.**
That fail-closed direction is the entire reason to prefer RLS.

Authorisation is three layers: middleware (session → `app.org_id`,
`app.user_id`, `app.role`), a pure-function policy check in
`packages/domain/policy`, and RLS as the backstop. Storage keys are
tenant-prefixed and the presigning code asserts the key prefix matches the
session's `org_id` before signing. Cross-tenant direct fetches return `404`,
never `403` — a `403` would confirm the row exists.

No cross-tenant read path exists: patients are not deduplicated across orgs,
there is no network-wide view, no shared checklist library, no global search.

## Alternatives considered

**Application-level `WHERE org_id = ?` only.** Rejected: one omission leaks
everything, and the omission is invisible in review. Fails open.

**Database per tenant.** Rejected: migration fan-out, connection-pool
multiplication, and operationally absurd for a prototype and for a
multi-hospital network.

**Schema per tenant.** Rejected: migration fan-out with no isolation benefit
over forced RLS, and cross-schema queries become the new leak vector.

**RLS without `FORCE`.** Rejected: the table owner bypasses the policy, which
silently defeats it whenever the app connects as the owner.

**Session-level `SET` instead of transaction-local `set_config`.** Rejected: a
pooled connection retains the setting across requests, producing exactly the
cross-tenant leak RLS was adopted to prevent.

## Consequences

**Positive.** Isolation holds even if an application query forgets its
predicate. `WITH CHECK` also blocks writing a row into another tenant. A
compromised or buggy handler still cannot read across the boundary. The
property is directly testable: two orgs with deliberately colliding MRNs, every
read path asserted scoped, plus a negative test that an unset `app.org_id`
returns zero rows.

**Negative.** Every database access must run inside a transaction with the
setting applied — a connection-handling discipline that must be centralised in
one helper and never bypassed. RLS adds a predicate to every query plan;
`org_id` must lead the relevant indexes. Debugging in `psql` requires setting
the variable manually, which is unfamiliar. Background jobs need an explicit,
audited elevation path rather than an ambient superuser connection.

**Neutral.** Any future federation feature (cross-hospital referral visibility)
becomes an explicit, consent-gated, separately audited capability with its own
decision record — not an emergent property of a shared table. That is the right
default.
