# 0008 — PostgreSQL-backed job queue for ingestion

**Status:** Accepted
**Date:** 2026-09-22

## Context

Document ingestion is a five-stage pipeline — render → OCR → classify →
extract → promote — that takes seconds to minutes per document. Running it
inside an HTTP request would block the upload response and time out on a long
scan. The demo needs visible ingestion progress: a document that is still
being processed must read as *in progress*, never as absent, because silently
missing information is the omission failure mode research §3.5 identifies as
more dangerous than hallucination.

`CLAUDE.md`: *"Do not introduce infrastructure without documenting why."*
Postgres and MinIO are already required. Anything further needs justification.

## Decision

**`pg-boss` on the existing PostgreSQL instance.** No new infrastructure.

`apps/worker` is a second process of the *same* build — not a separate service,
not a separate repository, not a separate deployment artefact. It consumes jobs
and calls the identical domain services the web process uses.

The pipeline is an explicit, resumable state machine over
`document.ingest_status`:

```
received → rendering → ocr_running → classifying → extracting → ready
                                                             ↘ failed
                                                             ↘ quarantined
```

Each stage is one job that reads the current status, performs exactly one
transformation, writes its output, and advances the status **in the same
transaction**. Stages are idempotent and individually retryable, so a failure
at `extracting` never re-runs OCR. `ingest_status` is surfaced in the UI, so a
stuck document is visibly stuck.

`quarantined` is a real terminal state, not an error bucket: handwritten or
illegible documents land there with `manual_transcription_required` and route
to a human transcription workflow where the transcriber becomes the
`extractor_kind='human'` author with full provenance.

## Alternatives considered

**BullMQ + Redis.** Rejected: adds a whole stateful service purely for
queueing, when the database we already run does the job. Also splits
transactional boundaries — a job enqueued in Redis cannot commit atomically
with the Postgres row that describes it, so crash windows appear between "row
written" and "job queued".

**Synchronous processing inside the upload request.** Rejected: times out on
large scans, gives no progress visibility, and makes a single slow document
block the uploader.

**In-process `setImmediate`/promise queue with no persistence.** Rejected: jobs
vanish on restart, and a document silently stops mid-pipeline with no record —
precisely the invisible-omission failure this design is built to prevent.

**A separate microservice for document processing.** Rejected by the brief
(*"Do not introduce microservices unless clearly justified"*) and unjustified
on merit: a second process of the same build gets the isolation benefit without
a network boundary, a separate deploy, or a duplicated type contract.

**Temporal / a workflow engine.** Rejected: five fixed sequential stages is a
state machine, not an orchestration problem. The engine would be larger than
the pipeline.

## Consequences

**Positive.** Zero new infrastructure. Jobs commit atomically with the rows
they describe, so there is no lost-job window. Restart-safe: `ingest_status`
plus persisted jobs let processing resume exactly where it stopped. Stage-level
retry avoids re-doing expensive OCR. Ingestion progress is a first-class,
observable state rather than an absence. The worker can be scaled to multiple
instances by adding processes.

**Negative.** Queue load and application load share one database; heavy polling
would contend with query traffic (acceptable at prototype volume, and a reason
to revisit at pilot scale). `pg-boss` creates its own schema, so migrations
must account for tables the application does not own. Two processes to start
locally — handled by Docker Compose.

**Neutral.** Throughput ceiling is far below a dedicated broker's. Irrelevant
for a prototype ingesting tens of documents; a pilot with thousands per hour
would reconsider, which would then need its own decision record.
