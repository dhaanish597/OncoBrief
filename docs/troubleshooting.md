# OncoBrief — Troubleshooting

## Local

**`pnpm db:up` fails / port 5432 in use.** Another Postgres is running. Stop it
or change the port mapping in `docker-compose.yml` and `DATABASE_URL`.

**`pnpm demo:reset` hangs or errors with `migration_failed`.** Check Postgres is
healthy (`docker compose ps`), then inspect the failing migration. Migrations
are transactional; a failure rolls back the whole file.

**`missing_env:SESSION_COOKIE_SECRET`.** Copy `.env.example` to `.env`.

**Upload through the app lands `quarantined` with
`manual_transcription_required`.** Expected: there is no OCR adapter for
arbitrary scans offline. Use a fixture document, or run the Textract path.

**TypeScript cannot find a new package.** Run `pnpm install` after adding a
workspace package so pnpm links it.

## Upload URL endpoint

**`501 presign_unavailable`.** `STORAGE_DRIVER` is `fs`. Direct upload needs S3
or MinIO/LocalStack. Set `STORAGE_DRIVER=s3` and the `STORAGE_S3_*` variables,
or use the existing in-app upload server action.

**`415 unsupported_content_type`.** Only PDF, JPEG, PNG and plain text are
accepted, and magic bytes are checked by the worker, not the client header.

**`413 upload_too_large`.** The cap is 25 MB.

**`404 not_found`.** The patient does not exist in your organization. This is
deliberate — a cross-tenant id must not reveal existence.

## Worker

**Worker exits with `QUEUE_DRIVER=memory is for tests only`.** Set
`QUEUE_DRIVER=sqs`; the memory driver only exists for unit tests.

**Messages pile up in the DLQ.** The `dlq-not-empty` alarm is the signal. Inspect
`document_ingestion_job.last_error` and `document.ingest_error`, and the worker's
structured logs filtered by `correlation_id`. Common causes: Textract role ARN
missing, object not yet visible (rare S3 eventual consistency), or a span
validation rejecting every candidate.

**A document is stuck at `ocr_running`.** If `TEXTRACT_NOTIFICATION_TOPIC_ARN`
is unset the worker self-polls; check `OCR_MAX_POLLS` and the poll messages. If
it is set, check the SNS subscription is confirmed and the queue policy allows
SNS to publish.

**Evidence appears twice.** It should not. Stage 2 checks
`document_ingestion_job.stage = 'completed'` first. If duplicates occur, the job
row is missing — verify migration `0007` applied and that the worker has
`SELECT/INSERT/UPDATE` on `document_ingestion_job`.

**`bedrock_no_tool_use`.** The configured model did not honour forced tool use,
or `BEDROCK_MODEL_ID` names a model unavailable in `AWS_REGION`. Set a model that
supports the Converse tool API in that region, or use `EXTRACTION_DRIVER=rule`.

## Terraform

**`terraform validate` fails after `init`.** Run `terraform fmt -recursive` and
re-read the error; module variable names must match those declared.

**`Invalid Attribute Combination` on the lifecycle rule.** The rule needs a
`filter {}` block (already present; keep it when editing).

**Apply is rejected by S3 because the queue policy is missing.** The
`aws_s3_bucket_notification` depends on the SQS module; if applying selectively,
apply the `sqs` module first.

**Costs higher than expected.** The NAT gateway and RDS are the cost drivers.
Set `enable_nat_gateway = false` and destroy when idle.

## Cognito

**`401` with a valid-looking token.** Check `COGNITO_ISSUER` and
`COGNITO_CLIENT_ID`. The verifier also requires the user to exist in the
`membership` table with matching `org_id` and role; a token alone is not enough.

**`unknown_key`.** The JWKS did not contain the token's `kid`. Clear the
in-process cache (restart) or confirm the user pool id in the issuer.

## Deployed environment (ap-south-1) — failures seen in practice

These were hit and fixed during the real deployment; keep them as a checklist.

**`Lambda was unable to configure your environment variables ... reserved keys: AWS_REGION`** — the runtime injects `AWS_REGION`; do not set it in the Lambda environment.

**S3 `403` on PutObject with an SSE-KMS bucket** — the role needs `kms:GenerateDataKey` (write) and `kms:Decrypt` (read) on the bucket CMK, not just `s3:PutObject`/`GetObject`.

**S3 `SignatureDoesNotMatch`** — the request must address the object key, not just the endpoint origin. Path-style and virtual-hosted addressing must both append the path (`origin + path`).

**`self-signed certificate in certificate chain` from pg** — pg 8 treats `sslmode=require` as `verify-full`, and the RDS CA is not in Node's trust store. Either bundle the RDS CA and use `verify-full`, or (prototype) leave TLS on with verification disabled.

**`current transaction is aborted, commands ignored until end of transaction block`** — a statement failed inside a tenant transaction and the next statement was rejected. Occurred when the duplicate-document UPDATE violated the SHA-256 unique constraint. Pre-check for the duplicate and keep a NULL hash on the duplicate row instead of catching the violation mid-transaction.

**Bedrock `INVALID_PAYMENT_INSTRUMENT` / `aws-marketplace:Subscribe`** — Anthropic models require a Marketplace subscription. Use a first-party model (Amazon Nova) or add a payment instrument.

**Bedrock HTTP `424 Model produced invalid sequence as part of ToolUse`** — an open/generic `value` object in the tool schema produced malformed tool JSON. Use a string `value` (and/or a more capable model).

**`invalid input syntax for type date: ""`** — the model returned an empty date string. Normalise empty and written dates to ISO or null in the adapter before they reach a `date` column.

**Queue messages stuck / DLQ not empty** — the worker leaves a message undeleted on failure so SQS redelivers and redrives. Read `document_ingestion_job.job_error` and the structured log `correlation_id`, fix, then purge and re-run.

## Still stuck

The demo/status claims in this repository are only made where tests observed
them. If a behaviour here does not match what you see, treat the code and the
test output as authoritative, and update this file rather than guessing.
