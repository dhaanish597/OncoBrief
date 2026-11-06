# PHASE 10 — SCALING ROADMAP, COST OPTIMIZATION & AWS SPEND PROTECTION

**Document ID:** `18-scaling-and-cost-optimization.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  

---

## 1. Alerts vs. True Hard Spending Limits (Critical Distinction)

**Important Architectural Truth:** **AWS Budgets and AWS Cost Anomaly Detection do NOT automatically stop running resources or block API calls by default**—they are **notification alerts**. To prevent runaway spending from a retry loop, a malicious upload flood, or a runaway AI script, OncoBrief pairs **soft billing alerts** with **7 hard technical execution ceilings** enforced in code and AWS service quotas:

### 1.1 Seven Hard Technical Spend Ceilings (True Hard Limits)

| # | Hard Control | Where Configured | Exact Limit Enforced | Maximum Financial Blast Radius |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Lambda Worker Concurrency Cap** | `infra/modules/lambda/main.tf` (`scaling_config.maximum_concurrency` & `reserved_concurrent_executions`) | `maximum_concurrency = 5` per SQS queue (`10` total across ingest + OCR) | Caps maximum concurrent Textract/Bedrock worker invocations and caps RDS worker connections at `20`. |
| **2** | **SQS Retry & DLQ Ceiling** | `infra/modules/sqs/main.tf` (`redrive_policy`) & `OCR_MAX_POLLS` | `maxReceiveCount = 3` (moves failing job to DLQ after 3 attempts); `OCR_MAX_POLLS = 40` | Prevents infinite OCR/LLM retry loops on corrupt PDFs. |
| **3** | **Maximum Upload Size & Page Cap** | `apps/web/src/app/api/v1/patients/[id]/documents/upload-url/route.ts` & `documents.ts` | Max file size = **`25 MB`** (`10 MB` for STT audio); max pages per single document = **`50 pages`** | Prevents a single 2,000-page upload from triggering `$10+` in unexpected OCR/LLM charges. |
| **4** | **Pre-OCR SHA-256 Deduplication** | `packages/db/src/services/documents.ts` & `apps/worker/src/handlers/document-ingest.ts` | Byte-identical `content_sha256` within `(org_id, patient_id)` marks `duplicate_candidate` and halts before OCR | `0` Textract, Sarvam, or Bedrock calls on re-uploaded or re-faxed documents. |
| **5** | **Born-Digital PDF Native Bypass** | `packages/adapters/src/ocr-routing.ts` (`LocalMultimodalOcrAdapter`) | Extracts native PDF text streams (`>= 50` chars/page) in-process before calling cloud OCR | Cuts paid cloud OCR volume by **40%–55%** (`$0.00/page`). |
| **6** | **Bedrock `maxTokens` & Clinical Refusal Gate** | `packages/adapters/src/bedrock-llm.ts:74` & `apps/web/src/lib/assistant/classify.ts` | `maxTokens = 2048`, `temperature = 0`; diagnostic/treatment prompts refused deterministically in **`0` LLM calls** | Bounds maximum output token cost per call to `<= $0.0068`. |
| **7** | **CloudWatch Log Retention & S3 Lifecycle** | `infra/modules/web/main.tf`, `infra/modules/lambda/main.tf`, `infra/modules/s3/main.tf` | Logs expire after `7 days` (`dev`) / `30 days` (`pilot`); incomplete multipart S3 uploads abort after `7 days` | Prevents unbounded CloudWatch and orphaned S3 multipart storage growth. |

---

## 2. Three AWS Budget Profiles & Cost Anomaly Detection (`ap-south-1`)

All resources are tagged via Terraform `default_tags` with `Project = "oncobrief"`, `Environment = "<dev|pilot|prod>"`, and `ManagedBy = "terraform"`.

| Budget Profile | Target Environment | Estimated Monthly Baseline (USD / INR) | Monthly Budget Cap (`100%`) | Alert Thresholds (`SNS Email`) |
| :--- | :--- | :---: | :---: | :--- |
| **1. Demo Safety Budget** | `oncobrief-dev` (Arch A) | `$32.17/mo` (`₹2,718`) | **`$40.00/mo` (`₹3,380`)** | `50%` (`$20` Actual), `80%` (`$32` Actual), `100%` (`$40` Forecasted) |
| **2. Single-Hospital Pilot Budget** | `oncobrief-pilot` (Arch B, 100 users) | `$149.18/mo` (`₹12,606`) | **`$180.00/mo` (`₹15,210`)** | `60%` (`$108` Actual), `80%` (`$144` Actual), `100%` (`$180` Forecasted) |
| **3. Multi-Hospital Prod Budget** | `oncobrief-prod` (Arch C, 5 hospitals) | `$619.07/mo` (`₹52,311`) | **`$750.00/mo` (`₹63,375`)** | `70%` (`$525` Actual), `85%` (`$637` Actual), `100%` (`$750` Forecasted) |

- **AWS Cost Anomaly Detection:** Update the existing `Default-Services-Monitor` in Account `375546530800` from its `$100` threshold down to **`$10.00` absolute impact OR `25%` daily spike**, alerting immediately if Textract or Bedrock daily spend spikes abnormally.

---

## 3. Ranked Cost-Optimization Opportunities & 12-Month Growth Projection

### 3.1 Ranked Optimization Opportunities (Scenario 3: 100-User Hospital)

| Optimization Opportunity | Monthly Savings (USD / INR) | Implementation Effort | Risk | Condition / When to Apply |
| :--- | :---: | :---: | :---: | :--- |
| **1. Fix Textract `TABLES+FORMS` ($0.065/p) -> `DetectDocumentText` ($0.0015/p)** | **`$508.00/mo` (`₹42,926/mo`)** | `30 mins` (3 lines in `textract-ocr.ts`) | None (`normalizeTextractBlocks` only reads `LINE` blocks) | **Immediately (Mandatory P1)** |
| **2. Eliminate Managed NAT Gateway (`enable_nat_gateway = false`)** | **`$40.88/mo` (`₹3,454/mo`)** | `1 hour` (Terraform variable + SG) | None (RDS stays private; Fargate uses public-egress subnet) | **Immediately (Mandatory P0)** |
| **3. Pre-Approved 11-Locale Templates + S3 TTS Caching** | **`$29.57/mo` (`₹2,499/mo`)** | `2 hours` (Cache WAV by `SHA256(locale+body)`) | None (Deterministic template rendering) | **Stage 2 Pilot Launch** |
| **4. Tier-1 `Nova Lite` for Standard Docs, `Nova Pro` for Complex Packets** | **`$14.80/mo` (`₹1,251/mo`)** | `2 hours` (`bedrock-llm.ts` model router) | Low (Stage A+B gate still validates 100% of quotes) | When monthly docs exceed `1,500/mo` |
| **5. Switch Fargate & Lambda from `x86_64` to Graviton2 `ARM64`** | **`$3.85/mo` (`₹325/mo`)** (`$15.40/mo` at 4 tasks) | `1 hour` (`Dockerfile` + Terraform) | None (All dependencies verified on `arm64`) | **Immediately (Stage 3 IaC)** |
| **6. 1-Year Compute Savings Plan + RDS Reserved Instance** | **`$14.60/mo` (`₹1,234/mo`)** (~29% discount) | `15 mins` (AWS Billing Console) | Commits for 12 months | Only after 60 days of steady hospital pilot usage |

### 3.2 12-Month Cost Projection (Ramp from Demo -> 1 Hospital -> 5 Hospitals)

| Month | Deployment Phase | Active Hospitals (Registered Staff) | Monthly Docs (Pages) | AWS Infra Cost (USD) | AI / OCR / Voice Cost (USD) | Total Monthly Cost (USD / INR Ex-GST) |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **M1 – M2** | Hackathon & Clinical Shadow Prep (`Arch A`) | 1 Demo (`10` users) | `50` (`200` pp) | `$30.68` | `$1.49` | **`$32.17/mo` (`₹2,718/mo`)** |
| **M3 – M4** | 25-User Single-Hospital Shadow Pilot (`Arch B-Micro`) | 1 Hospital (`25` users) | `500` (`2,000` pp) | `$56.22` | `$14.88` | **`$71.10/mo` (`₹6,008/mo`)** |
| **M5 – M8** | Full 100-User Single-Hospital Pilot (`Arch B-Small`) | 1 Hospital (`100` users) | `2,500` (`10,000` pp) | `$76.78` | `$72.40` | **`$149.18/mo` (`₹12,606/mo`)** |
| **M9 – M12** | Multi-Hospital Hub-and-Spoke Rollout (`Arch C`) | 5 Hospitals (`500` users) | `12,500` (`50,000` pp) | `$247.07` | `$372.00` | **`$619.07/mo` (`₹52,311/mo`)** |
| **Year 1 Total** | **12-Month Cumulative Operating Spend** | **1 -> 5 Hospitals** | **61,100 Docs** | **`$1,466.52`** | **`$1,810.34`** | **`$3,276.86` (`₹2,76,895` Ex-GST)** |
