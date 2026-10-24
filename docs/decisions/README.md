# Architecture Decision Records

Each record states **context**, **decision**, **alternatives considered** and
**consequences**, per `CLAUDE.md`.

Full detail for every decision below lives in
[`docs/architecture/oncobrief-architecture.md`](../architecture/oncobrief-architecture.md).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith-typescript-postgres.md) | Modular monolith on TypeScript, Next.js and PostgreSQL | Accepted |
| [0002](0002-append-only-evidence-ledger.md) | Append-only Evidence Ledger with rebuildable projections | Accepted |
| [0003](0003-provenance-anchored-to-text-spans.md) | Provenance anchored to OCR text spans | Accepted |
| [0004](0004-deterministic-first-extraction.md) | Deterministic-first extraction; the LLM proposes, it never writes | Accepted |
| [0005](0005-human-only-conflict-resolution.md) | Deterministic conflict detection, human-only resolution | Accepted |
| [0006](0006-tenant-isolation-via-postgres-rls.md) | Tenant isolation via PostgreSQL Row-Level Security | Accepted |
| [0007](0007-object-storage-s3-compatible-port.md) | Document blobs in S3-compatible object storage | Accepted |
| [0008](0008-postgres-backed-job-queue.md) | PostgreSQL-backed job queue for ingestion | Accepted |
| [0009](0009-hash-chained-ledger-and-audit.md) | Hash-chained ledger and audit streams | Accepted |
| [0010](0010-administrative-checklists-are-authored.md) | Administrative checklists are human-authored, never inferred | Accepted |
| [0011](0011-simulated-patient-delivery.md) | Patient delivery is simulated in the prototype | Accepted |
| [0012](0012-extension-launch-layer-only.md) | Browser extension limited to a launch-layer contract | Accepted |
| [0013](0013-object-storage-port-defaults-to-filesystem.md) | Object storage port defaults to the local filesystem | Accepted |
| [0014](0014-raw-sql-data-access-via-node-postgres.md) | Raw SQL data access via node-postgres | Accepted |
| [0015](0015-aws-backend-in-typescript-in-place.md) | AWS backend implemented in TypeScript, in place | Accepted |
| [0016](0016-landing-page-integration.md) | Landing page integrated into the web app as a scoped route group | Accepted |
| [0020](0020-v4-foundation-schema.md) | V4 foundation schema: oncology tables, baseline consultation dates and longitudinal audit | Accepted |
| [0021](0021-document-ocr-integrity.md) | Configured OCR with real page integrity and explicit failure | Accepted |
| [0022](0022-consultation-readiness-batch-verification.md) | Consultation readiness experience, server-enforced batch verification, and standard bundle intake | Accepted |
| [0023](0023-opd-human-offers-and-ownership.md) | Human-controlled oncology capacity, reservations and task ownership | Accepted |
| [0024](0024-source-grounded-guidelines-and-clinician-studio.md) | Source-grounded oncology guideline co-pilot and clinician productivity studio | Accepted |
| [0025](0025-caregiver-voice-continuity-and-accessibility.md) | Caregiver voice continuity, attendance confirmation, and WCAG accessibility | Accepted |

## Conventions

- One decision per file, numbered sequentially, never renumbered.
- Status: `Proposed` → `Accepted` → `Superseded by NNNN`.
- A superseded record is kept and edited only to add its superseding link.
- Changing any assignment in the deterministic/model-assisted/human-only table
  (architecture §18) or adding to the closed `fact_type` or `task_kind`
  vocabularies **requires a new record**. Those boundaries are the non-clinical
  guarantee and must not drift silently.

[0018 — Consent revocation preserves immutable ledger history](0018-consent-revocation-preserves-ledger.md).

- [0019 — Source-dated longitudinal observations](0019-longitudinal-source-observations.md)
- [0020 — V4 foundation schema](0020-v4-foundation-schema.md)
- [0021 — Document OCR integrity](0021-document-ocr-integrity.md)
- [0022 — Consultation readiness experience, batch verification, and bundle intake](0022-consultation-readiness-batch-verification.md)
- [0023 — Human-controlled oncology OPD offers and ownership](0023-opd-human-offers-and-ownership.md)
- [0024 — Source-grounded oncology guideline co-pilot and clinician productivity studio](0024-source-grounded-guidelines-and-clinician-studio.md)
- [0025 — Caregiver voice continuity, attendance confirmation, and WCAG accessibility](0025-caregiver-voice-continuity-and-accessibility.md)
