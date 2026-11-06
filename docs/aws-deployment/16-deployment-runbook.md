# PHASE 11 — SAFE DEPLOYMENT, MIGRATION, ROLLBACK & RECOVERY RUNBOOK

> **Do not execute this sequence unchanged.** November 5 inspection confirmed the main stack was deleted and remote state is stale. Worker build does not currently auto-sync 23 migrations; the readiness route is absent. Restore/reconcile and satisfy [the current approval plan](21-redeployment-audit-and-plan-2026-11-05.md) first. The example `deployed.spec.ts` suite also performs workflow mutations and is not read-only, despite its section label below.

**Document ID:** `16-deployment-runbook.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  

> **SAFETY WARNING:** Commands marked with **`[MUTATING / BILLABLE]`** create, modify, or delete cloud resources or incur AWS charges. Do **not** execute mutating commands until P0 preflight checks are complete and approved.

---

## 1. Prerequisites & Safe Read-Only Preflight Checks (`[SAFE / READ-ONLY]`)

```bash
# 1. Verify local toolchain versions (Node >= 22, pnpm 9.15.4, Terraform >= 1.10, Docker)
node -v
pnpm -v
terraform -version
docker info --format '{{.Architecture}}'

# 2. Verify AWS caller identity is NOT root and region is ap-south-1 (Mumbai)
aws sts get-caller-identity
aws configure get region

# 3. Inspect existing deployed resources in ap-south-1 (Read-Only)
aws rds describe-db-instances --region ap-south-1 \
  --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceClass,EngineVersion,DBInstanceStatus,PubliclyAccessible]' \
  --output table

aws ecs describe-services --region ap-south-1 \
  --cluster oncobrief-dev-web --services oncobrief-dev-web \
  --query 'services[0].[serviceName,status,desiredCount,runningCount,taskDefinition]'

aws sqs list-queues --region ap-south-1 --queue-name-prefix oncobrief
```

---

## 2. Local Build, Clinical Boundary & Worker Bundle Sequence (`[SAFE / LOCAL]`)

```bash
# 1. Install locked dependencies and run full verification gate (886+ unit/DB tests + clinical boundary check)
pnpm install --frozen-lockfile
pnpm verify

# 2. Build Lambda worker & admin bundles (auto-syncing all 23 SQL migrations 0001..0023)
pnpm worker:build
ls -lh infra/build/worker/
```

---

## 3. Infrastructure Provisioning via Terraform (`[MUTATING / BILLABLE]`)

```bash
# 1. Initialize remote S3 state in ap-south-1 with native S3 lockfile (use_lockfile = true)
terraform -chdir=infra/environments/dev init -reconfigure

# 2. Validate HCL syntax and generate deterministic execution plan (SAFE / READ-ONLY PLAN)
terraform -chdir=infra/environments/dev validate
terraform -chdir=infra/environments/dev plan -out=tfplan

# 3. [MUTATING / BILLABLE] Apply verified plan only after reviewing resource diff (0 unexpected destroys on RDS/S3)
terraform -chdir=infra/environments/dev apply tfplan
```

---

## 4. Pre-Migration RDS Snapshot & In-VPC Database Migration (`[MUTATING]`)

Because RDS PostgreSQL (`oncobrief-dev-db`) resides in an isolated private subnet with `PubliclyAccessible = false`, all schema migrations (`0001`–`0023`) execute via the in-VPC `oncobrief-dev-admin` Lambda:

```bash
# 1. [MUTATING] Take mandatory pre-migration RDS snapshot and wait for completion
SNAPSHOT_ID="oncobrief-dev-db-pre-mig-$(date -u +%Y%m%d-%H%M%S)"
aws rds create-db-snapshot \
  --region ap-south-1 \
  --db-instance-identifier oncobrief-dev-db \
  --db-snapshot-identifier "${SNAPSHOT_ID}"
aws rds wait db-snapshot-available \
  --region ap-south-1 \
  --db-snapshot-identifier "${SNAPSHOT_ID}"

# 2. [MUTATING] Invoke in-VPC admin Lambda to apply migrations 0001 through 0023
aws lambda invoke --region ap-south-1 \
  --function-name oncobrief-dev-admin \
  --payload '{"action":"migrate"}' \
  --cli-binary-format raw-in-base64-out /tmp/migrate-out.json
cat /tmp/migrate-out.json

# 3. [SAFE / READ-ONLY] Probe RLS isolation on RDS (must show 0 rows without context, >0 with context)
aws lambda invoke --region ap-south-1 \
  --function-name oncobrief-dev-admin \
  --payload '{"action":"probe","orgSlug":"demo"}' \
  --cli-binary-format raw-in-base64-out /tmp/probe-out.json
cat /tmp/probe-out.json
```

---

## 5. Web Container Build (`linux/arm64`) & ECS Rolling Deployment (`[MUTATING / BILLABLE]`)

```bash
# 1. Authenticate Docker to Amazon ECR in ap-south-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com/oncobrief-dev-web"
GIT_SHA=$(git rev-parse --short HEAD)

aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.ap-south-1.amazonaws.com"

# 2. [MUTATING] Build and push linux/arm64 Graviton2 image with immutable Git SHA tag
docker buildx build --platform linux/arm64 \
  -t "${ECR_URI}:sha-${GIT_SHA}" \
  -t "${ECR_URI}:latest" \
  --push .

# 3. [MUTATING] Roll out new task definition revision on ECS Fargate and wait for stability
terraform -chdir=infra/environments/dev apply -var="web_image_tag=sha-${GIT_SHA}"
aws ecs wait services-stable --region ap-south-1 \
  --cluster oncobrief-dev-web --services oncobrief-dev-web
```

---

## 6. Post-Deployment Verification & Smoke Testing (`[SAFE / READ-ONLY]`)

```bash
WEB_URL=$(terraform -chdir=infra/environments/dev output -raw web_url)

# 1. Deep health & RLS readiness check
curl -fsS "${WEB_URL}/api/v1/health?deep=1" | jq .

# 2. Run automated 11-point API smoke suite and 5-point deployed Playwright E2E suite
SMOKE_BASE_URL="${WEB_URL}" pnpm smoke:api
E2E_SKIP_SERVER=1 E2E_BASE_URL="${WEB_URL}" E2E_DEPLOYED_CODE=DEMO-ONCO-001 \
  pnpm --filter @oncobrief/web exec playwright test deployed.spec.ts
```

---

## 7. Rollback, DLQ Redrive & Teardown Procedures

### 7.1 Immediate Application Rollback (`< 2 Minutes`)
```bash
# Revert ECS service to previous known-good task definition revision
PREV_TASK_DEF="oncobrief-dev-web:14" # Replace with prior revision number
aws ecs update-service --region ap-south-1 \
  --cluster oncobrief-dev-web \
  --service oncobrief-dev-web \
  --task-definition "${PREV_TASK_DEF}" \
  --force-new-deployment
aws ecs wait services-stable --region ap-south-1 \
  --cluster oncobrief-dev-web --services oncobrief-dev-web
```

### 7.2 DLQ Inspection & Rate-Limited Redrive
```bash
aws sqs start-message-move-task --region ap-south-1 \
  --source-arn "arn:aws:sqs:ap-south-1:${AWS_ACCOUNT_ID}:oncobrief-dev-document-ingest-dlq" \
  --destination-arn "arn:aws:sqs:ap-south-1:${AWS_ACCOUNT_ID}:oncobrief-dev-document-ingest" \
  --max-number-of-messages-per-second 2
```

### 7.3 Disposable Demo Teardown / Cost-Pause (`[DESTRUCTIVE / DEMO ONLY]`)
- **To pause RDS compute for up to 7 days without losing data (`Saves $15.33/mo`):**
  `aws rds stop-db-instance --region ap-south-1 --db-instance-identifier oncobrief-dev-db`
- **To scale ECS Fargate web tasks to zero between demos (`Saves $7.21–$14.42/mo`):**
  `aws ecs update-service --region ap-south-1 --cluster oncobrief-dev-web --service oncobrief-dev-web --desired-count 0`
