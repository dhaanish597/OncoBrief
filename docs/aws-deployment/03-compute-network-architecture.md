# AGENT 3 — AWS COMPUTE AND NETWORKING ARCHITECTURE

**Document ID:** `03-compute-network-architecture.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Role:** Agent 3 — AWS Compute and Networking Architect  

---

## 1. Executive Summary & Fixed-Cost Trap Analysis (`[VERIFIED]`)

An audit of `infra/environments/dev/main.tf` and `infra/modules/{vpc,web,lambda,rds,s3,sqs,api_gateway}` reveals why the current `oncobrief-dev` AWS deployment costs **~$93–$109/month at idle**:

1. **Trap #1 — Managed NAT Gateway (`infra/modules/vpc/main.tf:48`):** Costs **`$40.88/month`** (`$0.056/hr` in `ap-south-1`) + **`$3.65/month`** for its Elastic IPv4 (`$44.53/mo` total idle floor) + `$0.056/GB` processed.
2. **Trap #2 — Public Application Load Balancer (`infra/modules/web/main.tf:207`):** Costs **`$17.45/month`** (`$0.0239/hr` in `ap-south-1`) + **`$7.30/month`** for 2 public IPv4 ENIs across 2 AZs (`$24.75/mo` base before LCUs) and currently communicates with CloudFront over unencrypted `http-only` (`port 80`).
3. **Trap #3 — `X86_64` Compute Default (`infra/modules/web/main.tf`, `infra/modules/lambda/main.tf`):** Both ECS Fargate and AWS Lambda default to `x86_64`, paying a **25% premium** (or missing a **20% discount**) compared to AWS Graviton2 (`ARM64`), even though `node:22-bookworm-slim` (`@node-rs/argon2-linux-arm64-gnu`, `pg`, `pdf-lib`) and the pure-JS `esbuild` worker bundle are 100% `ARM64`-compatible.
4. **Trap #4 — Unused API Gateway (`infra/modules/api_gateway/main.tf`) & Unused Cognito Pool (`infra/modules/cognito/main.tf`):** Provisioned with `backend_uri = ""` while Next.js serves all `/api/v1/*` routes directly via CloudFront.

---

## 2. Regional Selection: `ap-south-1` (Mumbai) vs. `ap-south-2` (Hyderabad) (`[VERIFIED]`)

| Criterion | `ap-south-1` (Mumbai) | `ap-south-2` (Hyderabad) | Verified Decision |
| :--- | :--- | :--- | :--- |
| **Amazon Textract (`TextractOcrAdapter`)** | **Available** (`textract.ap-south-1.amazonaws.com` — Sync & Async S3 APIs) | **UNAVAILABLE** (No Textract endpoint in `ap-south-2`) | **Hard Blocker for `ap-south-2`:** Async Textract requires the S3 bucket and Textract endpoint in the same region. |
| **Amazon Bedrock (`BedrockLlmProvider`)** | **Available** (`bedrock-runtime.ap-south-1.amazonaws.com`, `apac.amazon.nova-pro-v1:0`, `apac.amazon.nova-lite-v1:0`) | Limited foundation model catalog; cross-region destination | **`ap-south-1` Wins:** Lowest latency and broadest model catalog in India. |
| **Compute & RDS Pricing** | `db.t4g.micro`: `$0.021/hr` (`$15.33/mo`); Fargate ARM64: `$0.03238/vCPU-hr` | Identical (`$0.021/hr` for `db.t4g.micro`) | **Tie (`$0.00` price difference)**. |
| **Existing Infrastructure State** | S3 state `oncobrief-tfstate-375546530800` & live stack already in `ap-south-1` | Empty | **Selected Region: `ap-south-1` (Mumbai)** (`ap-south-2` reserved for Stage 3 cross-region DR backups). |

---

## 3. NAT Gateway Elimination & CloudFront VPC Origins Analysis (`[VERIFIED]`)

If `enable_nat_gateway = false` is set in `infra/modules/vpc/main.tf` without a replacement egress path, private-subnet tasks can still reach **Amazon S3** via the free **S3 Gateway Endpoint (`$0.00/mo`)**, but **fail** to reach ECR, Secrets Manager, CloudWatch Logs, SQS, Textract, Bedrock, and external HTTPS APIs (`https://api.sarvam.ai`, `https://dev.abdm.gov.in`).

### Four Egress & Ingress Topologies Compared (`ap-south-1`)

| Network Topology | Monthly Fixed Egress + Ingress Cost | Reaches AWS APIs + External `api.sarvam.ai`? | Security Posture & Trade-Offs |
| :--- | :---: | :---: | :--- |
| **1. Current Stack (1 NAT GW + Public ALB)** | **`$69.28/mo`** (`$44.53` NAT + `$24.75` Public ALB) | Yes | High fixed idle cost; ALB exposed on public IPv4s (mitigated by CloudFront prefix list SG). |
| **2. 7 VPC Interface Endpoints (PrivateLink)** (`ecr.api`, `ecr.dkr`, `logs`, `secretsmanager`, `sqs`, `textract`, `bedrock-runtime`) | **`$66.43/mo` (1 AZ)** / **`$132.86/mo` (2 AZs)** (`$9.49/endpoint/AZ/mo`) | **NO — Breaks Sarvam AI & ABDM!** | Interface Endpoints only route to specific AWS services; outbound HTTPS to `api.sarvam.ai` and `abdm.gov.in` still fails without NAT/IGW! |
| **3. Public-Egress Subnet ECS Fargate (`assign_public_ip = true`) + Internal ALB via [CloudFront VPC Origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html) + Free S3 GW Endpoint** | **`$21.10/mo`** (`$17.45` Internal ALB + `$0.00` CloudFront VPC Origin + `$3.65` for 1 Task IPv4; **`$0.00` NAT!**) | **Yes (100% via free VPC IGW)** | **`[RECOMMENDED]` for Architecture B:** RDS stays in isolated private subnets (`publicly_accessible = false`); ALB is internal (`internal = true`, `$0` public IPs) reached via CloudFront VPC Origin; Fargate task has `assign_public_ip = true` for outbound IGW egress while its Security Group blocks **100% of inbound internet traffic** (allowing ingress strictly from the Internal ALB SG on port `3000`). |
| **4. Private-Subnet Compute + Graviton2 NAT Instance (`t4g.nano` `fck-nat`) + Free S3 GW Endpoint** | **`$5.69/mo`** (`$2.04` `t4g.nano` + `$3.65` EIP) + Internal ALB (`$17.45`) = **`$23.14/mo`** | **Yes (Supports both Fargate & in-VPC Lambda)** | Ideal when running in-VPC Lambdas (`document-ingest`, `ocr-result`, `admin`) that cannot use `assign_public_ip = true` directly. |

> **Important Note on Worker Lambdas & VPC Attachment (`[VERIFIED]`):**
> Do `oncobrief-dev-document-ingest` and `oncobrief-dev-ocr-result` even need to be inside a VPC if they use RDS? **Yes**, because they write directly to private RDS PostgreSQL (`PostgresIngestionStore`). However, if we run the lightweight `apps/worker` SQS poller (`apps/worker/src/index.ts`, which uses `< 60 MB` RAM) as a **background process or sidecar inside the ECS Fargate task** (or route in-VPC Lambdas through a `$2.04/mo` `t4g.nano` NAT instance), we eliminate the `$44.53/mo` Managed NAT Gateway completely!

---

## 4. Three Competing Compute + Network Architectures (`ap-south-1`)

### Architecture A — Minimum-Cost Demo / Hackathon (`~$30.61/mo` Fargate or `~$18.85/mo` LWA/EC2)
- **Web + Worker Compute:**
  - **Variant A1 (Zero-ALB Fargate):** 1 × ECS Fargate `ARM64` task (`0.25 vCPU / 0.5 GB RAM` = **`$7.21/mo`**) running in a public-egress subnet (`assign_public_ip = true`, `$3.65/mo` IPv4) with Security Group locked strictly to the `com.amazonaws.global.cloudfront.origin-facing` Managed Prefix List and `X-Origin-Verify` secret header, **or**
  - **Variant A2 (Scale-to-Zero Lambda Web Adapter):** `Dockerfile` with AWS Lambda Web Adapter (`ARM64`, `$0.00/mo` idle) fronted by CloudFront Function URL OAC.
- **Database:** Single-AZ RDS PostgreSQL 16 `db.t4g.micro` (`$15.33/mo` + `$2.62/mo` `20 GB gp3` = **`$17.95/mo`**) in private subnets (`publicly_accessible = false`).
- **Storage & Edge:** S3 (`SSE-KMS` with Bucket Keys enabled), CloudFront Free Tier (`1 TB/mo` free), SSM Parameter Store (`$0.00`).
- **Total Idle Fixed Cost:** **`$30.61/month` (`₹2,587/mo`)** on Fargate (`$0` NAT Gateway, `$0` ALB).

### Architecture B — Cost-Optimized Single-Hospital Production Pilot (~100 Users) (`[PRIMARY RECOMMENDED]`)
- **Edge & Origin Security:** Amazon CloudFront (`PriceClass_200`, TLS 1.3, `Managed-CachingOptimized` on `/_next/static/*`, `Managed-CachingDisabled` + `Cache-Control: private, no-store` on all dynamic/API routes) connected via **CloudFront VPC Origin (`aws_cloudfront_vpc_origin`, `$0.00/mo`)** to an **Internal Application Load Balancer (`internal = true`, `$17.45/mo`, `0` public IPv4s)** with HTTPS (`TLSv1.3`) ACM termination.
- **Web Compute (`apps/web`):** ECS Fargate Graviton2 (`ARM64`, `0.5 vCPU / 1024 MiB RAM` = **`$14.42/month`** for 1 task; scales `1 -> 3` tasks on `CPU > 60%` or `ALBRequestCountPerTarget > 450/min`).
- **Async Worker Compute (`apps/worker`):**
  - Co-located SQS consumer process (`node dist/worker.js` alongside `node server.js` inside the Fargate task, sharing the same `appPool` and IGW egress at **`$0.00` extra compute/NAT cost**), **plus** `oncobrief-admin` Lambda in-VPC (using S3 Gateway Endpoint + Secrets Manager Interface Endpoint or `t4g.nano` NAT) for migrations, **or** SQS-triggered `ARM64` Lambdas (`document-ingest`, `ocr-result` with `maximum_concurrency = 5` and `DB_POOL_MAX = 2`).
- **Database:** Private RDS PostgreSQL 16 **`db.t4g.small` Single-AZ** (`2 vCPU, 2 GiB RAM`, `$30.66/mo` + `30 GB gp3` `$3.93/mo` = **`$34.59/mo`**; or `db.t4g.micro` at `$17.95/mo` for 25-user shadow pilots) with 14-day automated backups (PITR `RPO <= 5 min`), `deletion_protection = true`, and `sslmode=verify-full`.
- **Total Idle Fixed Cost:** **`$55.80/month` (`₹4,715/mo`)** on `db.t4g.micro` or **`$72.44/month` (`₹6,121/mo`)** on `db.t4g.small`.

### Architecture C — Scalable Multi-Hospital Production (5–20 Hospitals, 500–2,000 Staff)
- **Edge:** CloudFront + **AWS WAFv2** (`$6.00/mo` + rate limiting & OWASP rules) + CloudFront VPC Origin -> Internal Multi-AZ ALB.
- **Web Compute:** `2 to 8 ×` ECS Fargate Graviton2 (`ARM64`, `1 vCPU / 2048 MiB RAM` = `$28.84/mo` per task; `$57.68/mo` for 2 HA tasks across `ap-south-1a` and `ap-south-1b`).
- **Worker Compute:** Dedicated SQS + Lambda `ARM64` workers (`1024–1769 MB`, `maximum_concurrency = 15–30`) + PgBouncer (`pool_mode = transaction`).
- **Database:** Private **Multi-AZ RDS PostgreSQL 16 `db.t4g.medium`** (`4 GiB RAM`, `$122.64/mo` + `100 GB gp3` `$26.20/mo` = **`$148.84/mo`**, `RPO = 0`, `RTO = 60–120s`) with automated cross-region snapshot copy to `ap-south-2` (Hyderabad).
- **Total Idle Fixed Cost:** **`$236.22/month` (`₹19,961/mo`)**.
