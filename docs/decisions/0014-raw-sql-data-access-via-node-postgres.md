# 0014 — Raw SQL data access via node-postgres

**Status:** Accepted
**Date:** 2026-09-22
**Amends:** ADR 0001 (which named Drizzle ORM)

## Context

Architecture §2.2 selected Drizzle ORM for data access. The properties this
system depends on are all *database* properties, not ORM properties:

- Row-Level Security with transaction-local `set_config('app.org_id', …)`.
- `REVOKE UPDATE, DELETE` plus row triggers on the append-only tables.
- Per-org gap-free sequence allocation through a `SECURITY DEFINER` function
  that takes a row lock.
- `INSERT … RETURNING` and `FOR UPDATE` inside explicit transactions.
- Projection rebuild functions written in plpgsql.

Every one of these is expressed as literal SQL. A schema-builder layer would sit
between the code and the semantics that matter, and would need to model `bytea`
hash columns, `text[]`, `jsonb`, `inet`, composite constraints and partial
indexes faithfully to add value. For a schema this size, in a 2–4 week window,
that is duplicated effort with a new failure surface.

## Decision

Migrate and query with `node-postgres` (`pg`) and hand-written, parameterised
SQL. The DDL lives in `packages/db/migrations/*.sql`, applied by a small
transactional runner. Typed row interfaces are declared next to the repositories
that return them. Every query is parameterised; no string interpolation of
values.

## Alternatives considered

1. **Drizzle ORM.** Good SQL transparency, but the typed schema is a second
   declaration of the same tables and the advanced features still need `sql`
   escape hatches.
2. **Prisma.** Rejected in the architecture already — it abstracts away exactly
   the SQL this design must be explicit about.
3. **Kysely.** A reasonable middle ground; deferred rather than rejected.

## Consequences

- One source of truth for the schema: the SQL migrations.
- Row types are hand-maintained. This is a real cost; it is bounded because the
  repositories are thin and the domain layer is where the logic lives.
- Adding an ORM later is a refactor of `packages/db` only; no domain or UI code
  depends on the query mechanism.
- If a future contributor reintroduces an ORM, the RLS/append-only/hash-chain
  behaviour must be re-verified against the integration tests, which are written
  against the database rather than the client library.
