# OncoBrief — AWS Deployment Status

**Last updated:** 2026-10-03
**Region:** `ap-south-1` (Mumbai)
**AWS account:** `375546530800`
**Environment:** `oncobrief-dev` (Terraform, `infra/environments/dev`)
**State:** S3 backend `oncobrief-tfstate-375546530800`, key `oncobrief/dev/terraform.tfstate`, native S3 locking (`use_lockfile`).

> This document covers the **backend and platform** deployment. The web tier is
> deployed as well — see §7 below and
> [`final-submission-verification.md`](final-submission-verification.md) for the
> public prototype URL.
>
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

- **The API Gateway proxy target (`backend_uri`) is intentionally empty.** The
  web tier is a full-stack Next.js server that talks to RDS directly; it is not
  an API Gateway client. API Gateway exists for the Cognito JWT bearer path.
- The app-role database password is the prototype's fixed dev credential.
- RDS TLS uses `rejectUnauthorized: false` (encrypted, not certificate-verified);
  bundling the RDS CA is the hardening step.
- Deployment uses a long-lived IAM access key held in the operator's local AWS
  credentials file rather than a federated/SSO principal. See §8.

## 7. Web tier (added 2026-09-25, ADR 0016)

`module.web` deploys the Next.js application as the full-stack server:

| Layer | Resource |
|---|---|
| Registry | ECR `oncobrief-dev-web` |
| Runtime | ECS Fargate service `oncobrief-dev-web`, 1 task, private subnets, no public IP |
| Ingress | ALB `oncobrief-dev-web` (public, HTTP:80, admitted only from the CloudFront origin-facing prefix list) |
| HTTPS | CloudFront `E1E7Q4M27D5UQO` → `https://dsc1vmsr4q09g.cloudfront.net` (AWS-owned certificate) |
| Secrets | Secrets Manager `oncobrief-dev-web` (DATABASE_URL, session secret, scoped S3 keys) injected as container secrets |
| Health check | `GET /login` → 200 |
| Deployment | Circuit breaker with automatic rollback enabled |

The web task reaches the private RDS through `aws_security_group_rule.rds_from_web`.
S3 CORS admits presigned PUT only from the CloudFront origin.

## 8. Credentials posture

Deployment currently runs under an IAM principal whose access key is stored in
the operator's local `~/.aws/credentials`. The key is **not** in this repository
and never has been. Recommended before any further use: replace the static key
with an IAM Identity Center (SSO) or short-lived role session, and rotate the
existing key.
