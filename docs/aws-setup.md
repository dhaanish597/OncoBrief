# OncoBrief — AWS Setup

Everything cloud-side is defined in Terraform under `infra/`. Do not create
these resources by hand. Region defaults to `ap-south-1`; the Bedrock model id
is a variable and is **never** assumed to exist in the region.

## 1. What Terraform creates

| Module | Resources |
|---|---|
| `vpc` | VPC, 2 public + 2 private subnets, IGW, optional single NAT, S3 gateway endpoint |
| `s3` | Private documents bucket, versioning, SSE-KMS, public-access block, multipart abort |
| `sqs` | `document-ingest` + DLQ, `ocr-result` + DLQ, redrive policies, Textract SNS topic + subscription, queue policies |
| `iam` | Lambda execution role (S3, SQS, Textract, Bedrock, Secrets Manager, KMS), S3→SQS role, Textract→SNS role |
| `rds` | PostgreSQL 16, private, encrypted, Secrets Manager master password, subnet group, security group |
| `cognito` | User pool with `custom:org_id`, the five role groups, SPA app client, optional domain |
| `lambda` | Two worker functions (document-ingest, ocr-result) + the `admin` function + SQS event source mappings + log groups |
| `api_gateway` | HTTP API, Cognito JWT authorizer, optional proxy integration, access logs |
| `monitoring` | DLQ-depth alarms, Lambda error alarms, a pipeline dashboard |

## 1a. Remote state (bootstrap first)

State lives in S3 with native locking (`use_lockfile`, Terraform ≥ 1.10 — no
DynamoDB). The bucket must exist first, so it is bootstrapped separately with
local state (git-ignored, one bucket, idempotent):

```bash
cd infra/bootstrap
terraform init
terraform apply -var="state_bucket=oncobrief-tfstate-<account-id>"
```

Then initialise the environment, which uses the backend in
`infra/environments/dev/versions.tf`:

```bash
cd infra/environments/dev
terraform init -reconfigure
```

## 2. Prerequisites

- Terraform ≥ 1.10 and AWS credentials (SSO or environment). Never put keys in
  `terraform.tfvars`.
- Build the worker bundle **before** planning, because Terraform zips
  `infra/build/worker` with `archive_file`:

```bash
pnpm install
pnpm worker:build            # esbuild → infra/build/worker/{index.js,admin.js}
```

The bundle contains no native module: the narrow `@oncobrief/db/worker` barrel
excludes `@node-rs/argon2`, and `pg` is bundled.

```bash
pnpm verify
pnpm worker:build
terraform -chdir=infra/environments/dev init -reconfigure
terraform -chdir=infra/environments/dev validate
terraform -chdir=infra/environments/dev plan -out=tfplan
terraform -chdir=infra/environments/dev apply tfplan
```

> **Cost warning.** The default creates a NAT gateway and a `db.t4g.micro`.
> Set `enable_nat_gateway = false` (and add interface endpoints) or destroy the
> stack when idle. RDS has `deletion_protection = false` and
> `skip_final_snapshot = true` for a disposable dev environment.

## 2a. Migrate, seed and drive E2E from the admin Lambda

RDS is private with no bastion, so these run in-VPC via `aws lambda invoke`:

```bash
# apply migrations 0001–0007
aws lambda invoke --function-name oncobrief-dev-admin \
  --payload '{"action":"migrate"}' --cli-binary-format raw-in-base64-out out.json

# create the Demo Organization, 5 role users and patient DEMO-ONCO-001
aws lambda invoke --function-name oncobrief-dev-admin \
  --payload '{"action":"seed-demo","orgSlug":"demo","orgName":"Demo Organization"}' \
  --cli-binary-format raw-in-base64-out out.json

# generate a synthetic 2-page PDF, upload to S3, trigger the real pipeline
aws lambda invoke --function-name oncobrief-dev-admin \
  --payload '{"action":"e2e","orgSlug":"demo"}' --cli-binary-format raw-in-base64-out out.json

# then poll
aws lambda invoke --function-name oncobrief-dev-admin \
  --payload '{"action":"document-status","orgSlug":"demo","documentId":"<id>"}' \
  --cli-binary-format raw-in-base64-out out.json
```

Other admin actions: `e2e-conflict`, `duplicate`, `review`, `conflicts`,
`evidence`, `probe`, `info`.

## 3. Wiring the worker

After apply, read the outputs:

```bash
terraform output
```

Set the values on the worker (or they are already injected into the Lambda
environment by `main.tf`):

```
QUEUE_DRIVER=sqs
STORAGE_DRIVER=s3
AWS_REGION=ap-south-1
S3_DOCUMENTS_BUCKET=<bucket_name>
STORAGE_S3_BUCKET=<bucket_name>
<SQS URLs / names from outputs>
EXTRACTION_DRIVER=bedrock        # only if a model exists in your region
BEDROCK_MODEL_ID=<a model id valid in AWS_REGION>
TEXTRACT_NOTIFICATION_TOPIC_ARN=<textract topic arn>
TEXTRACT_NOTIFICATION_ROLE_ARN=<textract sns role arn>
```

On Lambda the credentials arrive as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
/ `AWS_SESSION_TOKEN` environment variables automatically, which the zero-SDK
adapters read directly.

## 4. Database migration

Migrations are plain SQL under `packages/db/migrations`. Point
`DATABASE_MIGRATOR_URL` at the RDS master secret (resolved from Secrets Manager)
and run:

```bash
pnpm db:migrate
```

Migrations `0001`–`0007` are idempotent and tracked in `schema_migration`.

## 5. Cognito

- Create users and add them to a role group (`clinician`, `coordinator`,
  `records_officer`, `org_admin`, `auditor`).
- Set the user's `custom:org_id` to the organization UUID from the database.
- Set `AUTH_MODE=cognito` and the `COGNITO_*` variables. `apps/web/src/lib/auth-api.ts`
  verifies the JWT and then re-checks the database membership, so a signed token
  cannot grant an organization the user is not a member of.

## 6. Manual steps that remain

1. **Deploy the web tier** (the Next.js app) into the VPC — ECS Fargate behind
   an ALB, or Lambda Web Adapter — and set `backend_uri` on the API Gateway so
   the HTTP API proxies to it. This is the one genuinely outstanding item; it
   unblocks the browser E2E against AWS (see `docs/e2e-verification-report.md`).
   Alternative for local UI against real data: install the AWS Session Manager
   plugin, add an SSM bastion, and port-forward to RDS.
2. **Bedrock access.** Anthropic models need an AWS Marketplace subscription.
   This account lacks a payment instrument, so `apac.amazon.nova-pro-v1:0` is
   used. Set `bedrock_model_id` to a model your account can invoke; verify with
   `aws bedrock-runtime converse` before deploying.
3. **Replace the app-role DB credential.** `migrations/0001` creates
   `oncobrief_app` with a fixed dev password. Rotate it and move it to Secrets
   Manager for anything beyond the prototype.
4. **Bundle the RDS CA** and set `sslmode=verify-full` to replace
   `rejectUnauthorized:false`.
5. **Replace root-account deployment credentials** with an IAM/SSO principal.
6. Add a WAF, GuardDuty, Backup, and a DPDP compliance review before any pilot —
   none are present.
