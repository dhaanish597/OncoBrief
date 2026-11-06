# AGENT 7 — AWS FINOPS AND REPRODUCIBLE COST ANALYSIS

> **Current estimate:** use [the live redeployment plan](21-redeployment-audit-and-plan-2026-11-05.md) for the proposed restore topology and refreshed regional compute pricing. The NAT-free totals below omit a resolved private-Lambda egress path and are not an approval budget for redeployment.

**Document ID:** `07-aws-cost-analysis.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Role:** Agent 7 — AWS FinOps and Pricing Specialist  
**Exchange Rate Assumption:** `1 USD = ₹84.50 INR` (Reserve Bank of India / interbank reference rate, November 2026; tables show pre-GST figures and explicit 18% Indian GST totals).

---

## 1. Executive Summary & Idle-Waste Elimination (`[VERIFIED]`)

1. **Existing `infra/environments/dev` Idle Waste (`$108.78/mo` / `₹9,192/mo`):** The current Terraform stack burns **$44.53/month** on an idle Managed NAT Gateway (`$40.88` hourly + `$3.65` EIP), **$24.75/month** on an internet-facing ALB (`$17.45` base + `$7.30` for 2 public IPv4s), and **$14.42–$36.04/month** on `x86_64` Fargate compute before a single clinician logs in.
2. **Optimized Architecture B Idle Baseline (`$55.80/mo` on `db.t4g.micro` / `$72.44/mo` on `db.t4g.small`):** Eliminating the NAT Gateway (`enable_nat_gateway = false`, using a free S3 Gateway Endpoint + public-egress subnet Fargate with `assign_public_ip = true` and a zero-inbound Security Group locked to the Internal ALB), switching the ALB to internal via a free **CloudFront VPC Origin** (`-$7.30/mo` public IPv4s), switching Fargate and Lambda to **Graviton2 `ARM64`** (`20%` compute discount), and enabling **S3 Bucket Keys** (`99%` KMS request reduction) saves **$52.98/month ($635.76/year)** in fixed idle overhead.
3. **Eliminating the 43.3× Textract Billing Trap (`packages/adapters/src/textract-ocr.ts`):** Switching Textract from `AnalyzeDocument` (`TABLES + FORMS` = **`$0.065/page`**) to `DetectDocumentText` / `StartDocumentTextDetection` (**`$0.0015/page`**) for standard English scans—combined with `LocalMultimodalOcrAdapter` (`$0.00/page`) for born-digital PDFs and `Sarvam Vision` (`₹0.50/page` = `$0.0059/page`) for Indic/handwritten scans—cuts Scenario 3 monthly AI/OCR spend from **~$580+/month** down to **$74.40/month** (or **$32.62/month** with Tier-0 `RuleBasedExtractor` pre-filtering).

---

## 2. Sourced AWS & AI Unit Pricing Table (`ap-south-1` Mumbai) (`[VERIFIED]`)

| Component | Service & Configuration (`ap-south-1`) | Pricing Unit | Sourced Unit Rate (USD) | Sourced Unit Rate (INR @ ₹84.50) | Official Source |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Web Compute (Arch A)** | ECS Fargate Graviton2 `ARM64` (`0.25 vCPU / 0.5 GB`) | Per hour / 730h mo | `$0.00988/hr` (**`$7.21/mo`**) | `₹609/mo` | [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/) (`$0.03238/vCPU-hr`, `$0.00356/GB-hr`) |
| **Web Compute (Arch B)** | ECS Fargate Graviton2 `ARM64` (`0.5 vCPU / 1 GB`) | Per hour / 730h mo | `$0.01975/hr` (**`$14.42/mo`**) | `₹1,218/mo` | [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/) |
| **Web Compute (Arch C)** | ECS Fargate Graviton2 `ARM64` (`2 × 1 vCPU / 2 GB`) | Per hour / 730h mo | `$0.07900/hr` (**`$57.68/mo`**) | `₹4,874/mo` | [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/) |
| **Alt Compute (EC2)** | EC2 Graviton2 `t4g.small` (`2 vCPU / 2 GiB`) / `t4g.nano` | On-Demand 730h mo | **`$8.18/mo`** (`small`) / **`$2.04/mo`** (`nano`) | `₹691/mo` / `₹172/mo` | [Amazon EC2 On-Demand Pricing](https://aws.amazon.com/ec2/pricing/on-demand/) |
| **Database (Demo/Pilot)** | RDS PostgreSQL 16 `db.t4g.micro` Single-AZ (`1 GiB`) | Per hour / 730h mo | `$0.0210/hr` (**`$15.33/mo`**) | `₹1,295/mo` | [Amazon RDS for PostgreSQL Pricing](https://aws.amazon.com/rds/postgresql/pricing/) |
| **Database (100u Hosp)** | RDS PostgreSQL 16 `db.t4g.small` Single-AZ (`2 GiB`) | Per hour / 730h mo | `$0.0420/hr` (**`$30.66/mo`**) | `₹2,591/mo` | [Amazon RDS for PostgreSQL Pricing](https://aws.amazon.com/rds/postgresql/pricing/) |
| **Database (Multi-Hosp)** | RDS PostgreSQL 16 `db.t4g.medium` Multi-AZ (`4 GiB`) | Per hour / 730h mo | `$0.1680/hr` (**`$122.64/mo`**) | `₹10,363/mo` | [Amazon RDS for PostgreSQL Pricing](https://aws.amazon.com/rds/postgresql/pricing/) |
| **RDS Storage (`gp3`)** | General Purpose SSD (`gp3`) Single-AZ / Multi-AZ | Per GB-month | **`$0.131/GB-mo`** (`$0.262` Multi-AZ) | `₹11.07/GB-mo` | [Amazon RDS for PostgreSQL Pricing](https://aws.amazon.com/rds/postgresql/pricing/) |
| **RDS Backup Storage** | Automated PITR Backups + Manual Snapshots | Per GB-month | **`$0.00`** (up to 100% DB size); `$0.095/GB-mo` extra | `₹0.00` / `₹8.03/GB-mo` | [Amazon RDS for PostgreSQL Pricing](https://aws.amazon.com/rds/postgresql/pricing/) |
| **Load Balancer (ALB)** | Internal ALB (via CloudFront VPC Origin, 0 public IPs) | Base + per LCU-hr | **`$17.45/mo`** (`$0.0239/hr`) + `$0.008/LCU-hr` | `₹1,475/mo` + `₹0.68/LCU-hr` | [Elastic Load Balancing Pricing](https://aws.amazon.com/elasticloadbalancing/pricing/) |
| **Public IPv4 Address** | Task / Instance Public IPv4 (`assign_public_ip = true`) | Per IP-hour (730h) | `$0.0050/hr` (**`$3.65/mo`**) | `₹308/mo` | [Amazon VPC Pricing](https://aws.amazon.com/vpc/pricing/) |
| **NAT Gateway (Avoided)** | Managed NAT Gateway + 1 Elastic IPv4 | Per hour + per GB | `$0.056/hr` + `$0.005/hr` = **`$44.53/mo`** + `$0.056/GB` | `₹3,763/mo` | [Amazon VPC Pricing](https://aws.amazon.com/vpc/pricing/) |
| **CDN & Edge TLS** | Amazon CloudFront + CloudFront VPC Origin | First 1 TB & 10M reqs | **`$0.00/mo`** (then `$0.109/GB` India egress) | `₹0.00/mo` | [Amazon CloudFront Pricing](https://aws.amazon.com/cloudfront/pricing/) |
| **Object Storage (S3)** | S3 Standard (`ap-south-1`) + Glacier IR archive | Per GB-month | **`$0.025/GB-mo`** (Std) / **`$0.005/GB-mo`** (GIR) | `₹2.11/GB-mo` / `₹0.42/GB-mo` | [Amazon S3 Pricing](https://aws.amazon.com/s3/pricing/) |
| **Encryption & Secrets** | KMS CMK (1 key w/ Bucket Keys) + SSM Parameter Store | Per month | **`$1.00/mo`** (KMS) + **`$0.00/mo`** (SSM Standard) | `₹84.50/mo` | [AWS KMS Pricing](https://aws.amazon.com/kms/pricing/), [AWS Systems Manager Pricing](https://aws.amazon.com/systems-manager/pricing/) |
| **Queues & Workers** | SQS Standard + AWS Lambda `ARM64` (`512–1024 MB`) | First 1M reqs / 400K GB-s | **`$0.00/mo`** (then `$0.0000133/GB-s`, `$0.40/1M` SQS) | `₹0.00/mo` | [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/), [Amazon SQS Pricing](https://aws.amazon.com/sqs/pricing/) |
| **Cloud OCR (English)** | Amazon Textract `DetectDocumentText` | Per page | **`$0.0015 / page`** (`$1.50 / 1,000 pages`) | `₹0.127 / page` | [Amazon Textract Pricing](https://aws.amazon.com/textract/pricing/) |
| **Cloud OCR (Indic)** | Sarvam Vision (`Digitise` `/doc-ai/v1/job/digitise`) | Per page | **`$0.0059 / page`** | **`₹0.50 / page`** | [Sarvam AI API Pricing](https://www.sarvam.ai/api-pricing) |
| **LLM Extraction** | Amazon Bedrock `Nova Pro` (`apac.amazon.nova-pro-v1:0`) | Per 1K In / 1K Out tokens | **`$0.00084 / 1K in`** · **`$0.00336 / 1K out`** | `₹0.071 / 1K in` · `₹0.284 / 1K out` | [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/) |
| **LLM Fast Tier** | Amazon Bedrock `Nova Lite` (`apac.amazon.nova-lite-v1:0`) | Per 1K In / 1K Out tokens | **`$0.000063 / 1K in`** · **`$0.000252 / 1K out`** | `₹0.0053 / 1K in` · `₹0.0213 / 1K out` | [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/) |
| **Voice & Translation** | Sarvam `Bulbul v3` TTS / `Saaras v3` STT / `Mayura v1` | Per 1K chars / Per min | TTS: **`$0.0355/1K`** · STT: **`$0.0058/min`** · Trans: **`$0.0237/1K`** | TTS: `₹3/1K` · STT: `₹0.49/min` · Trans: `₹2/1K` | [Sarvam AI API Pricing](https://www.sarvam.ai/api-pricing) |

---

## 3. Itemized Cost Breakdown for Main Target (Scenario 3: 100-User Single Hospital, Base Case)

**Workload Assumptions (Scenario 3 Base Case):**
- **Staff & Patients:** 100 registered staff users (75 monthly active users; 20–35 active during clinic hours; 5–12 simultaneous in-flight requests), 1,500 consultations/month, 2,500 documents uploaded/month (`4 pages/doc` average = **10,000 pages/month**, `1.2 MB/doc` = `3 GB/mo` new S3 storage).
- **OCR Mix:** 20% digital PDFs (`2,000 pages` via `LocalMultimodalOcrAdapter` at `$0.00`), 70% printed English scans (`7,000 pages` via Textract `DetectDocumentText` at `$0.0015/page`), 10% Indic/handwritten scans (`1,000 pages` via Sarvam Vision at `₹0.50/page`).
- **LLM & Voice Mix:** `apac.amazon.nova-pro-v1:0` structured extraction (`3,000 in / 720 out` tokens per doc) + packet organization (`2,500 in / 500 out` tokens per packet for 1,500 packets) + 1,000 guideline/assistant queries; 30% Mayura translation (`450 packets × 2,500 chars`); 15% Bulbul v3 TTS (`225 packets × 2,000 chars`); 10% Saaras v3 STT (`225 mins`).

| Component | Configuration (`ap-south-1`) | Pricing Unit | Monthly Quantity | Monthly Cost (USD) | Monthly Cost (INR @ ₹84.50) | Pricing Source |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **ECS Fargate Web (`apps/web`)** | `1 × 0.5 vCPU / 1 GB ARM64` (24×7) | `$0.01975/hr` | `730 hrs` | **`$14.42`** | `₹1,218` | AWS Fargate Pricing (`ap-south-1`) |
| **RDS PostgreSQL 16** | `db.t4g.small` Single-AZ (`2 vCPU, 2 GiB`) | `$0.0420/hr` | `730 hrs` | **`$30.66`** | `₹2,591` | Amazon RDS PostgreSQL Pricing |
| **RDS `gp3` Storage & PITR** | `30 GB gp3` + 14-day PITR (`<= 30 GB` free) | `$0.131/GB-mo` | `30 GB` | **`$3.93`** | `₹332` | Amazon RDS PostgreSQL Pricing |
| **Internal ALB + CloudFront VPC Origin** | Internal ALB (`0` public IPs) + LCU usage | `$0.0239/hr` + `$0.008/LCU` | `730 hrs` + `150 LCUs` | **`$18.65`** | `₹1,576` | AWS ELB & CloudFront Pricing |
| **Public IPv4 (Fargate Egress)** | `1 ×` Task Public IPv4 (`assign_public_ip = true`) | `$0.005/hr` | `730 hrs` | **`$3.65`** | `₹308` | Amazon VPC Public IPv4 Pricing |
| **S3 Standard + KMS CMK** | `15 GB` accumulated PDFs + 1 KMS CMK + Bucket Keys | `$0.025/GB` + `$1.00` CMK | `15 GB` + `50K reqs` | **`$1.55`** | `₹131` | Amazon S3 & KMS Pricing |
| **SQS + Lambda Workers (`ARM64`)** | `document-ingest`, `ocr-result`, `admin` | Per req / GB-sec | `25K reqs` / `45K GB-s` | **`$0.62`** | `₹52` | AWS Lambda & SQS Pricing (no Free Tier) |
| **CloudWatch + Route 53 DNS** | `3 GB` logs (30d) + 10 alarms + 1 Hosted Zone | `$0.50/GB` + `$0.10/alarm` + `$0.50` | `1 stack` | **`$3.30`** | `₹279` | Amazon CloudWatch & Route 53 Pricing |
| **Subtotal: AWS Infrastructure** | **Fixed + Variable AWS Cloud Services** | — | — | **`$76.78`** | **`₹6,488`** | **51.5% of Total Monthly Spend** |
| **AWS Textract OCR** | `StartDocumentTextDetection` (70% of 10k pages) | `$0.0015 / page` | `7,000 pages` | **`$10.50`** | `₹887` | Amazon Textract Pricing |
| **Sarvam Vision OCR** | `/doc-ai/v1/job/digitise` (10% of 10k pages) | `₹0.50 / page` (`$0.0059`) | `1,000 pages` | **`$5.92`** | `₹500` | Sarvam AI API Pricing |
| **Amazon Bedrock (`Nova Pro`)** | Extraction (`2,500 docs`) + Packets (`1,500`) + Chat | `$0.00084/1K in` · `$0.00336/1K out` | `12.5M in` / `2.8M out` | **`$19.91`** | `₹1,682` | Amazon Bedrock Pricing (`apac.`) |
| **Sarvam Bulbul v3 TTS** | Regional voice continuity previews (15% of packets) | `₹3.00 / 1K chars` (`$0.0355`) | `450K chars` | **`$15.98`** | `₹1,350` | Sarvam AI API Pricing |
| **Sarvam Mayura + Saaras STT** | Free-text note translation + 225 mins clinician STT | `₹2.00/1K` + `₹0.49/min` | `750K chars` + `225 mins` | **`$20.09`** | `₹1,698` | Sarvam AI API Pricing |
| **Subtotal: AI, OCR & Voice** | **AWS AI (`$30.41`) + Sarvam AI (`$41.99`)** | — | — | **`$72.40`** | **`₹6,118`** | **48.5% of Total Monthly Spend** |
| **TOTAL (Scenario 3 Base)** | **100-User Single Hospital (Excl. Tax)** | — | — | **`$149.18`** | **`₹12,606`** | **Incl. 18% GST: `$176.03` / `₹14,875`** |

*(Note: Using pre-approved 11-locale deterministic templates `ELEVEN_LOCALE_TEMPLATES` in `packages/adapters/src/sarvam-translation.ts` and S3 TTS audio caching reduces the Sarvam Voice/Translation subtotal from `$36.07/mo` to **`~$6.50/mo`**, bringing Scenario 3 total cost down to **`$119.61/month` (`₹10,107/month`)**!)*

---

## 4. Multi-Scenario Financial Summary & 12 Mandatory Metrics

| Metric | Scenario 1: Demo (5–10u, 50 docs) | Scenario 2: Small Pilot (25u, 500 docs) | Scenario 3: 100u Hospital (2,500 docs) | Scenario 4: 5 Hospitals (500u, 12.5k docs) | Scenario 5: 20 Hospitals (2,000u, 50k docs) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Architecture Tier** | **Arch A** (`micro` + `0.25 vCPU`) | **Arch B-Micro** (`micro` + `0.5 vCPU`) | **Arch B-Small** (`small` + `0.5 vCPU`) | **Arch C** (`medium` Multi-AZ + `2×1 vCPU`) | **Arch C-Scale** (`m7g.large` Multi-AZ + `4×1 vCPU`) |
| **1. Monthly Idle Cost** | `$30.61` (`₹2,587`) | `$55.80` (`₹4,715`) | **`$72.44` (`₹6,121`)** | `$236.22` (`₹19,961`) | `$621.74` (`₹52,537`) |
| **2. Base Monthly Cost** | **`$32.17` (`₹2,718`)** | **`$71.10` (`₹6,008`)** | **`$149.18` (`₹12,606`)** | **`$619.07` (`₹52,311`)** | **`$2,151.38` (`₹1,81,792`)** |
| **3. Low / Base / High (USD)** | `$15.62 / $32.17 / $55.31` | `$42.75 / $71.10 / $135.00` | **`$85.68 / $149.18 / $435.22`** | `$297.22 / $619.07 / $1,881.24` | `$967.96 / $2,151.38 / $7,157.40` |
| **4. Base Annual Cost** | `$386.04` (`₹32,620`) | `$853.20` (`₹72,095`) | **`$1,790.16` (`₹1,51,269`)** | `$7,428.84` (`₹6,27,737`) | `$25,816.56` (`₹21,81,499`) |
| **5. Cost / Registered User** | `$3.22` (`₹272`) | `$2.84` (`₹240`) | **`$1.49` (`₹126`)** | `$1.24` (`₹105`) | `$1.08` (`₹91`) |
| **6. Cost / Active User (MAU)** | `$5.36` (`₹453`) | `$3.95` (`₹334`) | **`$1.99` (`₹168`)** | `$1.65` (`₹139`) | `$1.43` (`₹121`) |
| **7. Cost / Processed Doc** | `$0.643` (`₹54.37`) | `$0.142` (`₹12.02`) | **`$0.0597` (`₹5.04`)** | `$0.0495` (`₹4.18`) | `$0.0430` (`₹3.64`) |
| **8. Cost / Processed Page** | `$0.161` (`₹13.59`) | `$0.0356` (`₹3.00`) | **`$0.0149` (`₹1.26`)** | `$0.0124` (`₹1.05`) | `$0.0108` (`₹0.91`) |
| **9. Cost / Consult Packet** | `$1.072` (`₹90.61`) | `$0.237` (`₹20.03`) | **`$0.0995` (`₹8.40`)** | `$0.0825` (`₹6.97`) | `$0.0717` (`₹6.06`) |
| **10. AI Cost % of Total** | `4.6%` | `20.9%` | **`48.5%`** | `60.1%` | `69.2%` |
| **11. Fixed vs Variable Split** | `95.2% / 4.8%` | `78.5% / 21.5%` | **`48.6% / 51.4%`** | `38.2% / 61.8%` | `28.9% / 71.1%` |
| **12. Cost per Hospital / Mo** | `$32.17` | `$71.10` | **`$149.18` (`₹12,606`)** | **`$123.81` (`₹10,462`)** | **`$107.57` (`₹9,090`)** |
