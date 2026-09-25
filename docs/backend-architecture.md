# OncoBrief — Backend Architecture

**Status:** Implemented (prototype). Companion to
[`docs/architecture/oncobrief-architecture.md`](architecture/oncobrief-architecture.md)
and [ADR 0015](decisions/0015-aws-backend-in-typescript-in-place.md).

This document describes the backend that exists in this repository. It does not
describe a FastAPI service: the reference cloud brief was implemented in
TypeScript in place, because the Evidence Ledger and the domain rules are the
source of truth and must not be forked into a second language.

---

## 1. Pipeline

```
Upload (presigned S3 PUT)
  → S3 ObjectCreated
  → SQS document-ingest queue
  → worker stage 1: download, server-side SHA-256 + MIME sniff, BeginIngestionJob
  → Textract StartDocumentAnalysis
  → SNS completion → SQS ocr-result queue (or self-scheduled poll)
  → worker stage 2: GetDocumentAnalysis → normalize → retain raw OCR
  → deterministic promoter: span validation, fact-type allow-list, slot_key
  → evidence_fact + ledger_entry + evidence_state (append-only)
  → deterministic conflict detection
  → human verification / correction / rejection
  → timeline projection → tasks → consultation packet → continuity
```

Everything after the promoter is the existing product. The AWS work adds the
left half of that diagram without changing the right half.

## 2. Processes

| Process | Package | Role |
|---|---|---|
| Web | `apps/web` | Next.js UI, `/api/v1` route handlers, server actions |
| Worker | `apps/worker` | Two SQS consumers (long-running) and two Lambda entry points |
| Domain | `packages/domain` | Pure, I/O-free rules — the core IP |
| Ports | `packages/ports` | `OcrPort`, `AsyncOcrPort`, `StoragePort`, `PresignPutPort`, `ExtractionPort`, `QueuePort`, `LLMProvider`, `DeliveryPort` |
| Adapters | `packages/adapters` | Fixture/Filesystem (local) and SigV4/S3/SQS/Textract/Bedrock (cloud) |
| DB | `packages/db` | Migrations, RLS, services, auth, seed |

## 3. Ports and adapters

Local development and cloud development differ **only** by adapter selection:

| Port | Local default | Cloud |
|---|---|---|
| `StoragePort` | `LocalFsStorageAdapter` | `S3StorageAdapter` |
| `PresignPutPort` | not implemented | `S3StorageAdapter` |
| `OcrPort` | `FixtureOcrAdapter` (demo fixtures) | — |
| `AsyncOcrPort` | — | `TextractOcrAdapter` |
| `ExtractionPort` | `RuleBasedExtractor` | `LlmExtractionAdapter` → `BedrockLlmProvider` |
| `QueuePort` | `MemoryQueueAdapter` (tests) | `SqsQueueAdapter` |
| `LLMProvider` | — | `BedrockLlmProvider` (Converse + forced tool use) |

The S3, SQS, Textract and Bedrock adapters are implemented with `node:crypto`
SigV4 and `fetch` only — no AWS SDK — so they are unit-testable offline against
fixed inputs. This is a deliberate trade-off; see ADR 0015.

## 4. The LLM boundary, structurally enforced

`BedrockLlmProvider.extract_document` calls the Bedrock **Converse API with
`toolChoice` forcing a single tool whose `inputSchema` is a JSON Schema**. The
model has no free-text output channel. The returned object is validated again
locally by `parseFacts`:

1. `fact_type` must be in the closed vocabulary (`FACT_TYPES`). A forbidden
   concept (diagnosis, stage, risk, urgency, recommendation) has no vocabulary
   entry and is discarded.
2. `verbatim_quote` must be non-empty.
3. every `span_id` must be one of the spans supplied in the prompt.
4. the value must coerce to the fact type's `FactValue` kind.

Then the deterministic promoter re-validates the quote as a contiguous
substring of the actual OCR spans before any ledger write. A fabricated quote
has no anchor and is rejected mechanically.

The model never resolves a conflict, sets a state, authors a checklist or writes
patient prose. `generate_factual_packet` may only propose section headings and
an ordering over supplied events — the packet body stays deterministic.

## 5. Idempotency and at-least-once delivery

`document_ingestion_job` has `UNIQUE (document_id)` and is the idempotency gate:

- Stage 1 reads the job first; a redelivered S3 event while OCR is in flight is
  skipped, and a completed document is skipped entirely.
- Stage 2 checks the job stage before promoting. A completion notification and a
  poll may race; the first to reach `completed` wins and the second returns.
- `document` has `UNIQUE (org_id, patient_id, content_sha256)`. A byte-identical
  re-upload is flagged `duplicate_status = 'duplicate_candidate'` and the object
  is **never deleted**.

Transient errors leave the SQS message undeleted; SQS redelivers and, past
`MAX_RECEIVE_COUNT`, redrives to the per-queue DLQ.

## 6. Correlation and observability

`correlation_id` is created at upload (`up:{documentId}`) and carried through
document, ingestion job, audit events, evidence facts and ledger entries. Logs
are single-line JSON with `correlation_id`, `document_id`, `org_id`, `stage`,
`duration_ms`, `status`, `error_code`. Raw document text, quotes, patient names
and credentials are never logged (see `apps/worker/src/logger.ts`).

## 7. Packaging and in-VPC administration

- **Narrow worker barrel.** `@oncobrief/db/worker` exports only what the worker
  needs, excluding `services/auth` and `seed` and therefore the native
  `@node-rs/argon2`. The Lambda bundle is pure JavaScript (`pg` bundled), built
  by `pnpm worker:build` (esbuild) into `infra/build/worker/`.
- **Admin Lambda.** `admin.adminHandler` runs in the VPC and performs
  migrate / seed-demo / e2e / e2e-conflict / duplicate / review / conflicts /
  evidence / probe / info. It exists so the private RDS instance never needs a
  public endpoint or a bastion. It reads the RDS master credential from Secrets
  Manager at invocation time.
- **Migration bookkeeping** lives in `packages/db/src/migration-runner.ts`, used
  by both the CLI migrator (reads files) and the admin Lambda (bundled SQL), so
  the recorded history is identical.

## 8. Known limitations

- The Lambda entry points (`apps/worker/src/lambda.ts`) are real, but the Lambda
  bundle is not built by this repository; packaging (esbuild, native module
  externalisation) is a documented manual step. The long-running worker is the
  tested path.
- Textract polling without an SNS notification is supported for local dev; the
  cloud path uses the SNS topic.
- No off-box audit anchoring; a database-superuser compromise can rewrite and
  re-chain. Documented, not mitigated (architecture §24, T3).
