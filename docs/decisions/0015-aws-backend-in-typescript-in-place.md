# 0015 — AWS backend implemented in TypeScript, in place

**Status:** Accepted
**Date:** 2026-09-24

## Context

A cloud-backend brief specified a reference architecture of *frontend → API
Gateway → FastAPI → Cognito → S3 → SQS → Lambda → Textract → Bedrock → RDS
PostgreSQL*, and asked for an implementation across document ingestion,
asynchronous processing, OCR normalisation, structured extraction, the evidence
ledger, human review, contradictions, readiness, tasks, timeline, packets,
audit, auth, security, tests, local development, Terraform and observability.

The existing repository is a **TypeScript pnpm monorepo** with a Next.js 15
modular monolith, a pure `packages/domain` core, PostgreSQL with forced RLS and
an append-only evidence ledger, and fourteen accepted ADRs. The brief also
states, unambiguously: *do not restart the project; do not recreate existing
frontend work; preserve existing working functionality.*

There is no Python code, no FastAPI service, no AWS SDK dependency and no
`infra/` directory.

## Decision

Implement the requested cloud backend **in TypeScript, inside the existing
monorepo**, one-for-one against the requested resources and endpoints:

- `infra/` — Terraform modules for S3, SQS (+DLQ), Lambda, RDS, Cognito, API
  Gateway, IAM, monitoring, plus `environments/dev`.
- `packages/ports` — add `LLMProvider`, `QueuePort` and `AsyncOcrPort`.
- `packages/adapters` — add `AwsSigV4`, `S3StorageAdapter`,
  `SqsQueueAdapter`, `TextractOcrClient` and `BedrockLlmProvider`.
- `apps/worker` — the SQS consumer process, same build as the web app.
- `apps/web` — add `POST /api/v1/patients/{id}/documents/upload-url` and
  `GET /api/v1/evidence/{id}` as route handlers, alongside the existing
  server-action mutation surface.
- New additive migration `0007` for ingestion jobs, correlation IDs and packet
  events.

The FastAPI service described in the brief is **not** built, because doing so
would duplicate the evidence ledger and domain rules — the system's source of
truth — in a second language, which is the restart the brief forbids.

## Alternatives considered

**Build the FastAPI service as specified.** Rejected. It contradicts the
explicit instruction not to restart the project, and it would create two
implementations of span validation, the state machine and the hash chain. The
governing documents name the Postgres event-sourced schema as the core IP; a
parallel Python service would fork it.

**Port the whole repository to Python.** Rejected outright — a restart.

**Stay purely local (filesystem + inline ingestion).** Rejected. The brief's
security, isolation, async-processing and observability requirements are the
point of this work, and a local-only system cannot demonstrate them.

## Consequences

**Positive.** One language, one ledger, one set of domain rules. The existing
301 domain tests, the append-only guarantees and the RLS isolation tests remain
the safety net. The AWS adapters sit behind ports, so local development keeps
the filesystem and inline path and cloud development swaps adapters by
environment variable.

**Negative.** The brief's FastAPI-specific expectations (Python packaging,
uvicorn, Pydantic) are not met; this is recorded honestly. The `LLMProvider`
interface uses the brief's method names (`extract_document`,
`generate_factual_packet`, `search_records`) but is consumed by the existing
TypeScript promoter rather than a Python worker.

**Neutral.** `ADR 0007` (S3-compatible port) and `ADR 0008` (Postgres-backed
queue) are extended rather than superseded: S3 is now wired as a first-class
adapter, and SQS is added as a second queue driver alongside the local inline
path. The LLM remains a proposal source; it still cannot write to the ledger.
