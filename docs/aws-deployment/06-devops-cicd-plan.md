# AGENT 6 — DEVOPS, INFRASTRUCTURE-AS-CODE, AND CI/CD PLAN

**Document ID:** `06-devops-cicd-plan.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Role:** Agent 6 — DevOps and Infrastructure-as-Code Specialist  

---

## 1. Executive Summary & Epistemic Classification

OncoBrief already has a modular **Terraform** infrastructure codebase under `infra/` (`infra/bootstrap`, `infra/environments/dev`, and 9 modules under `infra/modules/`) with remote state stored in `s3://oncobrief-tfstate-375546530800/oncobrief/dev/terraform.tfstate` using native S3 locking (`use_lockfile = true`), plus a GitHub Actions workflow (`.github/workflows/ci.yml`) and a root `Dockerfile`.

However, our audit identified **6 concrete DevOps and IaC defects** (`[VERIFIED]`) that must be fixed to achieve reproducible, zero-downtime automated deployment:

| ID | Severity | File & Line Reference | Verified Defect | Required Fix |
| :--- | :---: | :--- | :--- | :--- |
| **`DEVOPS-01`** | **P0 Blocker** | `apps/worker/src/bundled-migrations.ts:10-54` vs `packages/db/migrations/0001..0023` | `bundled-migrations.ts` only bundles migrations `0001`–`0019` and omits `0020`–`0023`. In-VPC Admin Lambda (`{"action":"migrate"}`) leaves RDS missing `FORCE RLS` (`0020`), Wave 2 (`0021`), Patient Portal (`0022`), and FHIR R4 (`0023`). | Auto-generate `bundled-migrations.ts` in `apps/worker/scripts/build.mjs` from all 23 `.sql` files and fail CI if counts diverge. |
| **`DEVOPS-02`** | **P0 Blocker** | `.github/workflows/ci.yml:52` vs `infra/environments/dev/versions.tf` | `ci.yml:52` uses `terraform_version: "1.9.8"`, while `versions.tf` uses `use_lockfile = true` (which requires **Terraform >= 1.10.0**). `init -backend=false` masked this in CI. | Upgrade `ci.yml` and `deploy.yml` to `terraform_version: "1.10.5"`. |
| **`DEVOPS-03`** | **P1 High** | `Dockerfile:1-31` & `apps/web/next.config.ts` | Single-stage `Dockerfile` copies the entire monorepo (`node_modules`, test results, `.pptx` files) into a `~1.2 GB` runtime image running as `root` on `x86_64`. | Refactor `Dockerfile` into a 3-stage `linux/arm64` Graviton2 build running as non-root `USER node` (`~220 MB`). |
| **`DEVOPS-04`** | **P1 High** | `infra/modules/lambda/main.tf:64, 96` & `apps/worker/scripts/build.mjs:33` | Lambda uses `runtime = "nodejs20.x"` (and `target: 'node20'`), whereas `package.json` and `Dockerfile` target Node.js `22`. | Upgrade Lambda runtime to `nodejs22.x`, `architectures = ["arm64"]`, and `target: 'node22'`. |
| **`DEVOPS-05`** | **P1 High** | `docs/AWS_READINESS_AUDIT.md` & `.github/workflows/ci.yml` | No AWS IAM OIDC identity provider (`token.actions.githubusercontent.com`) exists in Account `375546530800`; deployments relied on local CLI sessions. | Provision `aws_iam_openid_connect_provider.github` and a scoped `OncoBriefGitHubDeployRole` with short-lived STS tokens. |
| **`DEVOPS-06`** | **P1 High** | `docs/AWS_READINESS_AUDIT.md` | Local MacBook is missing `terraform` and `docker`/`colima` in `/opt/homebrew/bin` and has default AWS CLI region set to `us-east-1` instead of `ap-south-1`. | Install `terraform` and `colima`/`docker` via Homebrew and set `aws configure set default.region ap-south-1`. |

---

## 2. Infrastructure-as-Code (IaC) Framework Decision (`[VERIFIED]`)

| Criterion | **Selected: Existing Terraform (`>= 1.10.5`)** | AWS CDK v2 (TypeScript) | AWS CloudFormation / SAM |
| :--- | :--- | :--- | :--- |
| **Existing Investment** | **100% Built & Applied (`69+` resources in `s3://oncobrief-tfstate-375546530800`)** | 0% built (requires full rewrite & risky state import) | 0% built |
| **State Locking** | Native S3 lockfile (`use_lockfile = true`, `$0.00/mo` — no DynamoDB table needed) | CloudFormation stack locks | CloudFormation stack locks |
| **Maintainability** | Clean 9-module layout (`vpc`, `s3`, `sqs`, `iam`, `rds`, `cognito`, `lambda`, `web`, `monitoring`) | High abstraction churn | Verbose YAML |

---

## 3. Auto-Syncing Worker Migrations in `apps/worker/scripts/build.mjs` (`[RECOMMENDED]`)

Update `apps/worker/scripts/build.mjs` so `pnpm worker:build` automatically discovers and bundles all `.sql` files in `packages/db/migrations/` (`0001` through `0023`) and copies `packages/db/certs/rds-global-bundle.pem` into `infra/build/worker/`:

```javascript
// Addition to apps/worker/scripts/build.mjs before esbuild.build():
import { readdirSync, writeFileSync, copyFileSync } from 'node:fs';

const migrationsDir = resolve(repoRoot, 'packages', 'db', 'migrations');
const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const generatedTs = [
  `import type { MigrationFile } from '@oncobrief/db/worker';`,
  ...sqlFiles.map((f, i) => `import m${i} from '../../../packages/db/migrations/${f}';`),
  `export const BUNDLED_MIGRATIONS: MigrationFile[] = [`,
  ...sqlFiles.map((f, i) => `  { name: '${f}', sql: m${i} },`),
  `];`,
  ``,
].join('\n');

writeFileSync(resolve(workerRoot, 'src', 'bundled-migrations.ts'), generatedTs, 'utf8');
copyFileSync(
  resolve(repoRoot, 'packages', 'db', 'certs', 'rds-global-bundle.pem'),
  resolve(outdir, 'rds-global-bundle.pem'),
);
```

---

## 4. Multi-Stage `linux/arm64` Production `Dockerfile` (`[RECOMMENDED]`)

```dockerfile
# Stage 1: Install workspace dependencies
FROM --platform=linux/arm64 node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/ports/package.json packages/ports/package.json
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile

# Stage 2: Build Next.js application
FROM --platform=linux/arm64 deps AS builder
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @oncobrief/web build

# Stage 3: Hardened non-root production runner
FROM --platform=linux/arm64 node:22-bookworm-slim AS runner
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY --from=builder --chown=node:node /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/web ./apps/web

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["pnpm", "--filter", "@oncobrief/web", "start"]
```

---

## 5. Environment Strategy & Zero-Downtime GitHub Actions OIDC Pipeline (`[RECOMMENDED]`)

### 5.1 Environment Separation (`infra/environments/{dev,pilot,prod}`)
- **`dev` (Demo / Hackathon):** Uses synthetic fixtures only (`ONCOBRIEF_DEMO_MODE=true`), Single-AZ `db.t4g.micro`, 1 × `0.25 vCPU / 0.5 GB` `ARM64` Fargate task, S3 `oncobrief-documents-dev`, state key `oncobrief/dev/terraform.tfstate`.
- **`pilot` (100-User Single-Hospital Pilot):** Strictly isolated from `dev` (`ONCOBRIEF_DEMO_MODE=false`), Single-AZ `db.t4g.small` (`deletion_protection = true`), 1–3 × `0.5 vCPU / 1 GB` `ARM64` Fargate tasks, S3 `oncobrief-documents-pilot` (`force_destroy = false`), state key `oncobrief/pilot/terraform.tfstate`.
- **`prod` (Multi-Hospital Production):** Dedicated AWS Account, Multi-AZ `db.t4g.medium`, 2–8 × `1 vCPU / 2 GB` `ARM64` Fargate tasks, AWS WAFv2, 35-day PITR.

### 5.2 Nine-Gate Deployment Workflow (`.github/workflows/deploy.yml`)
1. **Gate 1 — OIDC Short-Lived Auth:** `aws-actions/configure-aws-credentials@v4` assumes `arn:aws:iam::375546530800:role/OncoBriefGitHubDeployRole` in `ap-south-1` (1-hour session TTL; zero static AWS keys).
2. **Gate 2 — Verification & Clinical Safety (`pnpm verify`):** Runs TypeScript typecheck, ESLint, `pnpm boundary:check` (18 forbidden clinical inference rules), `pnpm branding:check`, and 886+ unit/DB integration tests against a service container Postgres 16.
3. **Gate 3 — Worker Bundle & 23-Migration Sync Check:** Runs `pnpm worker:build` and verifies all 23 migrations (`0001`–`0023`) are embedded in `infra/build/worker/admin.js`.
4. **Gate 4 — `linux/arm64` Container Build & ECR Push:** Builds and pushes `375546530800.dkr.ecr.ap-south-1.amazonaws.com/oncobrief-<env>-web:sha-${GITHUB_SHA}`.
5. **Gate 5 — Terraform 1.10.5 Plan & Approval Gate:** Runs `terraform init` and `terraform plan -out=tfplan`; requires manual GitHub Environment approval for `pilot` and `prod`.
6. **Gate 6 — Pre-Migration RDS Snapshot:** Runs `aws rds create-db-snapshot` and `aws rds wait db-snapshot-available` before any schema change.
7. **Gate 7 — Terraform Apply & In-VPC Admin Lambda Migration:** Applies `tfplan` and invokes `oncobrief-<env>-admin` with `{"action":"migrate"}`, asserting `ok: true` and `23` applied migrations.
8. **Gate 8 — ECS Rolling Deployment with Circuit Breaker:** Waits for `aws ecs wait services-stable` (`deployment_circuit_breaker { enable = true, rollback = true }`).
9. **Gate 9 — Post-Deploy Smoke Test & Automated Rollback:** Runs `curl -fsS https://<domain>/api/v1/health?deep=1` and `pnpm smoke:api`. On failure, immediately rolls back `aws_ecs_service` to the previous task definition revision and restores the pre-migration RDS snapshot if DDL was involved.
