# OncoBrief — End-to-End Verification Report

**Deployment timestamp:** 2026-09-24 (Terraform apply ~17:52 UTC; pipeline runs 17:57–18:20 UTC)
**AWS region:** `ap-south-1`
**Account:** `375546530800`
**Environment:** `oncobrief-dev`
**Verifier:** automated CLI + in-VPC admin Lambda

No credentials or patient data appear here. All data is synthetic; the test
patient is `DEMO-ONCO-001` ("Synthetic Demo Patient").

---

## 1. Component status

| Component | Status | Notes |
|---|---|---|
| Infrastructure (Terraform) | PASS | 69 resources created, 0 destroyed; several in-place Lambda updates |
| Lambda | PASS | 3 functions deployed and invoked |
| Cognito | PASS | pool `ap-south-1_Ypc1KbaV7`, 5 role groups, `custom:org_id` claim |
| S3 | PASS | private, SSE-KMS, versioned; object written and read |
| SQS | PASS | 2 queues + 2 DLQs, SSE, redrive; S3→SQS delivery observed |
| SNS (Textract) | PASS | completion notification delivered to the OCR queue |
| Textract | PASS | real async job `2c9ba2761ef617dcd29b87432a4dbc1e7825e5db1e532fce464bec061ff44723`, 2 pages, 21 LINE spans |
| Bedrock | PASS | `apac.amazon.nova-pro-v1:0`, Converse + forced tool use |
| RDS PostgreSQL | PASS | 16.14, private, encrypted; migrations 0001–0007 applied |
| Evidence ledger (RDS) | PASS | 17 facts with full provenance |
| Tenant isolation (RDS) | PASS | app role: 0 rows without context, 5 with |
| Human review (RDS) | PASS | verify / correct / reject |
| Contradiction detection | PASS | 1 open conflict, both values retained |
| Duplicate detection | PASS | `duplicate_candidate`, OCR skipped |
| API Gateway | PARTIAL | HTTP API + Cognito authorizer created; proxy target not set (no deployed web tier) |
| API smoke test | **NOT RUN** | blocker: private RDS unreachable from the workstation; no web tier |
| Playwright E2E | **NOT RUN** | same blocker |

## 2. Pipeline proven

```
admin Lambda (API-equivalent)
  → reserve document row + generate synthetic 2-page PDF
  → S3 PutObject (SSE-KMS)
  → S3 ObjectCreated notification
  → SQS oncobrief-dev-document-ingest
  → Lambda oncobrief-dev-document-ingest: download, SHA-256, begin idempotency job
  → Textract StartDocumentAnalysis  (JobId recorded)
  → SNS completion → SQS oncobrief-dev-ocr-result
  → Lambda oncobrief-dev-ocr-result: GetDocumentAnalysis → normalise → retain raw
  → Bedrock Converse (forced tool use) → structured facts
  → deterministic promoter (span validation, fact-type allow-list, slot_key)
  → PostgreSQL: evidence_fact + ledger_entry + evidence_state
```

Traceable end to end by correlation id (`s3:<documentId>` on the worker path,
`e2e-<timestamp>` issued at upload) and `document_ingestion_job.provider_job_id`.

## 3. Test document

- **Identifier:** `synthetic-oncology-referral.pdf`
- **Document id:** `4b0e4f6b-8cee-447b-8e73-beaa34483ce1`
- **Patient:** `DEMO-ONCO-001`
- **Content (explicit administrative facts only):** procedure title, procedure
  date, discharge date, histopathology availability, imaging availability,
  issuing facility, referring clinician, document date, explicit follow-up
  appointment and an explicit "bring the previous imaging report" instruction.
- **No** diagnosis, stage, prognosis, treatment, risk or urgency.

## 4. Results

**Extraction (document 4b0e4f6b):** `ingest_status = ready`, 2 pages, 21 spans,
12 facts, Textract job succeeded, extraction via `apac.amazon.nova-pro-v1:0`,
all states `extracted` (awaiting human review).

**Ledger totals after the full run:**

| Metric | Count |
|---|---|
| Evidence facts (total) | 17 |
| — `extracted` | 11 |
| — `verified` | 2 |
| — `conflicting` | 2 |
| — `corrected` | 1 |
| — `rejected` | 1 |
| Extractor `llm` (Bedrock) | 16 |
| Extractor `human` (correction) | 1 |
| Open conflicts | 1 |
| Tasks | 0 (no source-backed task was created in this run) |
| Documents | 11 (includes duplicate and repeated test uploads) |

Every fact carries: value, verbatim quote, page number, extractor kind/name/
version, confidence band, state, document name. The API endpoint returns the
full provenance payload (see `docs/api.md`).

## 5. Safety cases

| Case | Expected | Observed |
|---|---|---|
| A — valid fact | fact created | ✅ 12 facts from one document |
| B — unreadable/unsupported text | no fabrication | ✅ only span-anchored candidates promoted; short lines dropped by the promoter |
| C — conflicting documents | both values retained, no silent pick | ✅ `appointment.recorded` → `10 February 2026` vs `17 February 2026 at Surgical Oncology OPD`, both state `conflicting`, `detection_reason=incomparable` |
| D — duplicate document | flagged, original preserved | ✅ `duplicate_status=duplicate_candidate`, `duplicate_of_document_id` set, 0 new spans/facts |
| E — corrected fact | original retained, replacement current | ✅ original facility fact → `corrected`; human replacement → `verified` (extractor_kind `human`) |
| Human review | extracted ≠ trusted | ✅ all extracted facts entered `extracted`; verify/reject/correct only via human actor |

## 6. Failures encountered and fixes applied

1. **`AWS_REGION` reserved Lambda env var** → removed from the Terraform env
   map; the runtime injects it.
2. **S3 PutObject 403** → the bucket uses SSE-KMS and the Lambda role lacked KMS
   permissions; added `kms:GenerateDataKey`/`Decrypt`/`DescribeKey` on the CMK.
3. **`SignatureDoesNotMatch` on PutObject** → the S3 adapter fetched only the
   endpoint origin, not the object path; corrected `endpointFor` and added a
   regression test asserting the request URL.
4. **`self-signed certificate in certificate chain`** → pg 8 treats
   `sslmode=require` as verify-full; the DB client now negotiates TLS with an
   explicit `rejectUnauthorized:false` for remote hosts.
5. **`current transaction is aborted`** on duplicate finalise → the duplicate
   UPDATE violated the unique constraint inside the transaction; rewritten to
   pre-check and to keep a NULL hash on the duplicate row.
6. **Bedrock `INVALID_PAYMENT_INSTRUMENT` (Anthropic)** → account lacks an AWS
   Marketplace subscription; switched to first-party `apac.amazon.nova-pro-v1:0`.
7. **Bedrock 424 invalid tool-use sequence (Nova Lite)** → the open object schema
   for `value` caused malformed tool JSON; changed `value` to a string and moved
   to Nova Pro.
8. **`invalid input syntax for type date: ""`** → the model returned an empty
   `date`; the adapter now normalises empty/written dates to ISO or null.

## 7. Known limitations

- Web tier, API smoke test and Playwright E2E are not deployed/run (see §8).
- `correctEvidence` was exercised from the admin Lambda, not the UI.
- No task was created in this run (the task path is covered by local tests and
  the offline demo).
- RDS TLS is encrypted but not certificate-verified; the app-role password is
  the fixed prototype credential.

## 8. Blocker

**BLOCKING — browser E2E / API smoke against AWS.** The Next.js web tier is not
deployed, and the private RDS instance cannot be reached from the workstation
(no public endpoint, and the AWS Session Manager plugin is not installed). Two
supported remediations:

1. Deploy the web tier inside the VPC (ECS Fargate service behind an ALB, or
   Lambda Web Adapter) and set `backend_uri` on the API Gateway; or
2. Install the Session Manager plugin, add a small SSM bastion, and port-forward
   to RDS to run the app locally against the real database.

The data/processing plane is fully verified without either.
