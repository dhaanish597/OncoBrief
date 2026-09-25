# OncoBrief — Local Development

The default local setup is fully offline: PostgreSQL in Docker, filesystem
object storage, fixture OCR and rule-based extraction. No AWS account, no
credentials and no network are required.

## 1. Prerequisites

Node ≥ 22, pnpm 9, Docker (for Postgres). Terraform and AWS CLI are only needed
for the cloud path.

## 2. Run the app

```bash
pnpm install
cp .env.example .env          # defaults are fine for local development
pnpm db:up                    # docker compose up -d postgres
pnpm demo:reset               # migrate, seed, ingest the demo fixtures
pnpm dev                      # http://localhost:3000
```

Demo credentials are printed by `demo:reset`. All data is synthetic.

## 3. Run the tests

```bash
pnpm verify                   # typecheck + lint + boundary scan + all tests
pnpm test                     # every workspace test
pnpm --filter @oncobrief/adapters test   # SigV4, S3 presign, Textract, Bedrock parsing
pnpm --filter @oncobrief/worker test     # message parsing, idempotency, OCR handling
pnpm test:integration         # Postgres integration tests (needs Postgres)
```

Terraform:

```bash
pnpm infra:fmt
cd infra/environments/dev && terraform init -backend=false && terraform validate
```

## 4. The async pipeline locally

Two options:

**A. Inline (default).** Uploading through the app runs the pipeline in-process
(`QUEUE_DRIVER` is irrelevant; the existing server action path handles it). This
is what the demo and E2E tests use.

**B. SQS + LocalStack + S3 (closer to cloud).**

```bash
docker compose --profile aws up -d localstack
# create the bucket + queues in LocalStack, then:
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_REGION=us-east-1
export QUEUE_DRIVER=sqs STORAGE_DRIVER=s3
export STORAGE_S3_ENDPOINT=http://localhost:4566 STORAGE_S3_FORCE_PATH_STYLE=true
export S3_DOCUMENTS_BUCKET=oncobrief-documents
export SQS_DOCUMENT_QUEUE=oncobrief-document-ingest
export SQS_OCR_RESULT_QUEUE=oncobrief-ocr-result
pnpm dev:worker
```

LocalStack's Textract emulation is limited; expect to mock the OCR adapter for
anything beyond wiring checks.

## 5. Environment variables

Every key is documented in `.env.example`. The ones that change behaviour:

| Variable | Values | Meaning |
|---|---|---|
| `STORAGE_DRIVER` | `fs` \| `s3` | Object storage backend |
| `QUEUE_DRIVER` | `memory` \| `sqs` | Worker transport (`memory` is tests only) |
| `EXTRACTION_DRIVER` | `rule` \| `bedrock` | Extraction engine |
| `BEDROCK_MODEL_ID` | model id | Required when `EXTRACTION_DRIVER=bedrock` |
| `AUTH_MODE` | `session` \| `cognito` | Authentication mode |

## 6. Database

`packages/db/migrations/*.sql` are applied in order and recorded in
`schema_migration`. `0001_bootstrap` creates the `oncobrief_app` and
`oncobrief_migrator` roles; `0002`–`0007` build the schema. Never edit an
applied migration; add a new one.
