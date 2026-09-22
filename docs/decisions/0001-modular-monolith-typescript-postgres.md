# 0001 — Modular monolith on TypeScript, Next.js and PostgreSQL

**Status:** Accepted
**Date:** 2026-09-22

## Context

The repository is empty: no commits, no `package.json`, no code. The build
window is 2–4 weeks with a small team. No third-party AI credentials exist in
the environment. The demo must run offline on a laptop.

`cancer_track.md` proposes a multi-vendor stack (Sarvam Vision OCR,
Sarvam-105B, Saaras, Bulbul, LangChain/Hermes agent orchestration, WhatsApp,
IVR). The architecture brief instructs: *"Prefer the smallest architecture
capable of demonstrating the core product. Do not introduce microservices
unless clearly justified."* Research §5.1 states the event-sourced Postgres
schema *"is the actual core IP, not the LLM."*

Roughly 60% of the nineteen-step demo is interface work — hover-to-source,
the reconciliation room, the record map, the packet builder, the audit view.
Interface velocity, not model throughput, is the binding constraint.

## Decision

A **TypeScript modular monolith**: one codebase, two processes of the same
build (`apps/web` and `apps/worker`), one PostgreSQL 16 database, one
S3-compatible object store, orchestrated by Docker Compose.

- Next.js 15 App Router for UI and `/api/v1` route handlers
- Drizzle ORM with hand-written SQL migrations
- `packages/domain` is pure: no I/O, no database, no React
- Module boundaries enforced by lint rules; modules communicate through typed
  service interfaces
- `/api/v1` is a genuine versioned HTTP contract so the future extension and
  any future SMART-on-FHIR client are first-class consumers

## Alternatives considered

**Vendor-maximal, as written in `cancer_track.md`.** Rejected: requires five
credentialed vendors that do not exist here, makes the demo dependent on
network and quota, and its agent layer contradicts the explicit instruction not
to introduce autonomous agents. It spends the scarce weeks on integration glue
instead of the ledger.

**Python (FastAPI) document service + Node API + React SPA.** Rejected for this
window. Python's OCR/layout advantage is real but only materialises with
GPU-class models we can neither run nor credential. In exchange it costs a
second runtime, a second deployment, a cross-boundary type contract to keep in
sync, and a distributed failure mode during a live demo.

**NestJS/Fastify API + separate React SPA.** Rejected: cleaner service seam than
the monolith, same language, but more scaffolding before the first screen
renders. The seam is not worth a week.

**Prisma instead of Drizzle.** Rejected: this design depends on `CHECK`
constraints, `REVOKE`, RLS policies, partial indexes and triggers. Prisma
abstracts away precisely the SQL that must stay explicit.

## Consequences

**Positive.** One language across API, worker, UI, tests and seeds. One deploy
artefact. `packages/domain` being I/O-free makes the state machine, span
validator, comparators and readiness rules cheap to test exhaustively. Docker
Compose gives a reproducible offline demo. Extraction seams for later service
splits already exist.

**Negative.** Node is a weaker host for document ML than Python; handwriting
and difficult Indic-script OCR are out of reach without a cloud adapter
(recorded as risk R1 and as a stated limitation, not hidden). Next.js couples
UI and API release cadence. Drizzle requires writing more SQL by hand.

**Neutral.** Vertical scaling only. Adequate for a prototype; a pilot would
revisit.
