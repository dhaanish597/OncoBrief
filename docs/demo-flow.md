# OncoBrief — Demo Flow

The demo runs fully offline and is also the Playwright test suite
(`apps/web/e2e/demo-flow.spec.ts`). Every patient is synthetic and badged as a
fixture.

## 1. Run it

```bash
pnpm db:up
pnpm demo:reset      # idempotent: migrate, seed, ingest fixtures
pnpm dev             # http://localhost:3000
```

`demo:reset` prints demo logins. Password for all users: `oncobrief-demo`.

## 2. The nineteen steps

| # | Surface | Mechanism |
|---|---|---|
| 1 | `/workspace` | Readiness-ordered worklist |
| 2 | `/patients/DEMO-001` | RLS-scoped fetch |
| 3 | `/sources` | 9 documents, 4 facilities, duplicates flagged |
| 4 | `/evidence` | `timeline_event` projection |
| 5 | Evidence chip | `evidence_fact` + `evidence_state` |
| 6 | Source inspector | 60s presigned GET + `document.page_viewed` audit |
| 7 | Highlight | Stored normalized `text_span` geometry |
| 8 | Verify | `fact_verified` ledger entry, guard-checked |
| 9 | State badge | `evidence_state` projection |
| 10 | `/conflicts` | Comparator-detected `conflict_set` |
| 11 | Reconciliation room | `conflict_resolved` + mandatory reason |
| 12 | `/record-map` | `checklist_item` × `record_gap` |
| 13 | Missing cell | `record_gap.status = 'missing'` |
| 14 | Retrieval task | `admin_task` with `origin_record_gap_id` |
| 15 | `/packet` | Assembly including conflicts + gaps sections |
| 16 | Approve packet | Snapshot + `snapshot_sha256` + ledger seq |
| 17 | `/continuity` | Template + `message_variable_source` |
| 18 | Outbox preview | Verified-source gate; `simulated: true` |
| 19 | `/patients/[id]/audit` | `audit_event` + ledger verify green |

The contradiction is a genuine date disagreement between two real fixtures,
detected by the deterministic comparator at ingestion — not a flag in a seed
file. If the detector broke, the demo would visibly lack a conflict.

## 3. The AWS pipeline in the demo

`pnpm demo:reset` seeds synthetic documents and runs the **rule-based inline
pipeline**, so the demo needs no network. The cloud pipeline is the same
promotion code behind different adapters:

```
upload → S3 → SQS → worker → Textract → SQS → worker → promoter → ledger
```

To demonstrate the cloud path, run LocalStack + the worker
(`docs/local-development.md` §4) and use
`POST /api/v1/patients/{id}/documents/upload-url`, PUT the object to the
presigned URL, and watch the same evidence appear in the ledger with
`engine = textract` and `extractor_kind = llm` (when Bedrock is configured).

## 4. Safety invariants the demo exercises

- **No evidence, no timeline event** — a fact cannot exist without a span anchor.
- **Contradictions stay visible** — both values rendered side by side; no
  recency heuristic, no confidence tie-break.
- **Human-only consequential actions** — verify, correct, reject, resolve,
  assign, approve, export.
- **Corrections preserve the original** — the corrected fact links back.
- **Source-backed tasks** — the database refuses an unanchored task.
- **Append-only audit** — the demo closes on a passing hash-chain verification.

## 5. Honest labels

The UI marks demo fixtures, simulated delivery and machine-generated content
distinctly. The `/about` page states what is simulated, stubbed and unmeasured.
No clinical claim is made anywhere.

## 6. Verified on AWS (2026-09-24)

The same pipeline above was run against real AWS services in `ap-south-1`:
S3 → SQS → Lambda → Textract (async, 2 pages / 21 spans) → SNS → SQS → Lambda →
Bedrock (`apac.amazon.nova-pro-v1:0`, structured tool use) → PostgreSQL, producing
17 facts with full provenance, plus a contradiction (both values retained) and a
duplicate candidate. Human verify / correct / reject and correction lineage were
exercised on the deployed database. Full details:
[`docs/e2e-verification-report.md`](e2e-verification-report.md) and
[`docs/aws-deployment-status.md`](aws-deployment-status.md).
