# OncoBrief — AWS Deployment Status

**Last updated:** 2026-09-24
**Region:** `ap-south-1` (Mumbai)
**AWS account:** `375546530800`
**Environment:** `oncobrief-dev` (Terraform, `infra/environments/dev`)
**State:** S3 backend `oncobrief-tfstate-375546530800`, key `oncobrief/dev/terraform.tfstate`, native S3 locking (`use_lockfile`).

> No credentials or secrets appear in this document. The RDS master password is
> managed by Secrets Manager; the prototype's app-role password is documented in
> `docs/security.md` as a known hardening item.

---

## 1. What exists and what was verified

| Layer | Status | Evidence |
|---|---|---|
| Terraform (69 resources) | Applied | `terraform apply` → 71 in state, 0 destroy |
| Remote state | Configured | S3 bucket + versioning + AES256 + TLS-only policy |
| VPC / networking | Created | 2 private + 2 public subnets, NAT, S3 gateway endpoint |
| S3 documents bucket | Created, hardened | public access blocked, SSE-KMS (CMK), versioning on |
| SQS (2 queues + 2 DLQs) | Created | redrive policies, SSE on, scoped queue policies |
| SNS (Textract completion) | Created | subscription → OCR queue |
| RDS PostgreSQL 16.14 | Created | private (`PubliclyAccessible=false`), encrypted, SG scoped to the Lambda SG |
| Secrets Manager | In use | RDS-managed master credential |
| KMS | Created | rotating CMK, used by S3 and granted to the worker role |
| Cognito | Created | user pool + `custom:org_id` + 5 role groups + SPA client |
| Lambda (3 functions) | Deployed | `document-ingest`, `ocr-result`, `admin` |
| API Gateway HTTP API | Created | Cognito JWT authorizer (proxy target not yet set) |
| CloudWatch | Created | 3 log groups, error/DLQ alarms, dashboard |
| Database migrations 0001–0007 | Applied to RDS | via the in-VPC admin Lambda |
| Demo Organization + 5 users + patient | Seeded | via the admin Lambda |
| Textract async analysis | Working | real `JobId`, 2-page PDF, 21 spans |
| Bedrock structured extraction | Working | `apac.amazon.nova-pro-v1:0`, forced tool use |
| Evidence ledger writes on RDS | Working | 12 facts from one document, full provenance |
| Tenant isolation on RDS | Verified | app role 0 rows without context, 5 with |
| Human review on RDS | Verified | verify / correct (original retained) / reject |
| Contradiction detection | Verified | two sources disagree → both `conflicting` |
| Duplicate detection | Verified | byte-identical upload → `duplicate_candidate`, OCR skipped |

## 2. Deployed identifiers (non-secret)

| Output | Value |
|---|---|
| Documents bucket | `oncobrief-documents-dev` |
| Document queue | `oncobrief-dev-document-ingest` (+ `-dlq`) |
| OCR queue | `oncobrief-dev-ocr-result` (+ `-dlq`) |
| RDS endpoint | `oncobrief-dev-db.cvcoks6qgrox.ap-south-1.rds.amazonaws.com` |
| Cognito user pool | `ap-south-1_Ypc1KbaV7` |
| Cognito client | `5tvp1tcqpdcamb1a0ojl206afb` |
| Cognito issuer | `https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_Ypc1KbaV7` |
| API Gateway | `https://aqcq720fme.execute-api.ap-south-1.amazonaws.com` |
| Lambda functions | `oncobrief-dev-document-ingest`, `oncobrief-dev-ocr-result`, `oncobrief-dev-admin` |
| KMS key | `arn:aws:kms:ap-south-1:375546530800:key/bb27fe5e-bd3e-46c6-a496-c4187ebec246` |

## 3. Lambda packaging

`pnpm worker:build` bundles two entries with esbuild into `infra/build/worker/`:

- `index.js` — `index.documentIngestHandler`, `index.ocrResultHandler`
- `admin.js` — `admin.adminHandler` (migrate / seed-demo / e2e / e2e-conflict / duplicate / review / conflicts / document-status / evidence / probe / info)

The bundle contains no native module: a narrow `@oncobrief/db/worker` barrel
excludes `@node-rs/argon2` (used only by auth/seed). `pg` is bundled. Terraform
zips the directory with `archive_file` and sets `source_code_hash`, so a code
change updates the function.

## 4. Bedrock

| Field | Value |
|---|---|
| Region | `ap-south-1` |
| Model / profile | `apac.amazon.nova-pro-v1:0` (cross-region inference profile, APAC) |
| Invocation API | `bedrock-runtime` Converse with forced tool use |
| Result | Structured `emit_operational_facts` payload, span-anchored |

Anthropic models on this account are blocked: `INVALID_PAYMENT_INSTRUMENT` /
missing `aws-marketplace:Subscribe`. Amazon Nova is first-party and requires no
Marketplace subscription. The model id remains configuration
(`BEDROCK_MODEL_ID`), so switching providers needs no code change.

**Data residency:** the `apac.` inference profile may route within APAC
(Mumbai, Sydney, Tokyo, Singapore, Seoul). For strict single-region processing,
use a direct in-region model id that supports on-demand throughput, or a
single-region application inference profile.

## 5. Database access (no bastion)

RDS is private with no public endpoint and no SSM bastion, so migrations, seed
and verification run through the **admin Lambda** inside the VPC via
`aws lambda invoke`. This keeps the database unreachable from the Internet.

## 6. Known gaps / not done

- **Web tier not deployed to AWS.** The Next.js app runs locally only; the API
  Gateway proxy target (`backend_uri`) is empty. See the blocker in
  `docs/e2e-verification-report.md`.
- **API smoke test and Playwright E2E against AWS** were not run, for the same
  reason (the workstation cannot reach the private RDS, and no SSM session
  plugin is installed).
- The app-role database password is the prototype's fixed dev credential.
- RDS TLS uses `rejectUnauthorized: false` (encrypted, not certificate-verified);
  bundling the RDS CA is the hardening step.
- Account credentials used for deployment are **root** account credentials.
  Replace with an IAM/SSO principal before any further use.
