# PHASE 11 — AUTHORITATIVE RESEARCH SOURCES & REFERENCES

**Document ID:** `19-research-sources.md`
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`
**Audit Date:** November 5, 2026

---

## 1. Repository Primary Evidence Sources (`Verified`)

1. **Workspace & Build Configuration:**
   - [`package.json`](../../package.json), [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml), [`tsconfig.base.json`](../../tsconfig.base.json), [`Dockerfile`](../../Dockerfile), [`docker-compose.yml`](../../docker-compose.yml), [`.env.example`](../../.env.example), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
2. **Existing Terraform IaC (`infra/`):**
   - [`infra/bootstrap/main.tf`](../../infra/bootstrap/main.tf), [`infra/environments/dev/main.tf`](../../infra/environments/dev/main.tf), [`infra/environments/dev/variables.tf`](../../infra/environments/dev/variables.tf), [`infra/environments/dev/versions.tf`](../../infra/environments/dev/versions.tf).
   - Modules: [`infra/modules/vpc/main.tf`](../../infra/modules/vpc/main.tf), [`infra/modules/web/main.tf`](../../infra/modules/web/main.tf), [`infra/modules/rds/main.tf`](../../infra/modules/rds/main.tf), [`infra/modules/lambda/main.tf`](../../infra/modules/lambda/main.tf), [`infra/modules/s3/main.tf`](../../infra/modules/s3/main.tf), [`infra/modules/sqs/main.tf`](../../infra/modules/sqs/main.tf), [`infra/modules/iam/main.tf`](../../infra/modules/iam/main.tf), [`infra/modules/monitoring/main.tf`](../../infra/modules/monitoring/main.tf), [`infra/modules/api_gateway/main.tf`](../../infra/modules/api_gateway/main.tf), [`infra/modules/cognito/main.tf`](../../infra/modules/cognito/main.tf).
3. **Database Schema, RLS & Services (`packages/db`):**
   - SQL Migrations `0001`–`0023`: [`packages/db/migrations/0001_bootstrap.sql`](../../packages/db/migrations/0001_bootstrap.sql) through [`packages/db/migrations/0023_fhir_interoperability.sql`](../../packages/db/migrations/0023_fhir_interoperability.sql).
   - Connection Pool & RLS Context: [`packages/db/src/client.ts`](../../packages/db/src/client.ts), [`packages/db/src/env.ts`](../../packages/db/src/env.ts), [`packages/db/certs/rds-global-bundle.pem`](../../packages/db/certs/rds-global-bundle.pem).
4. **AI, OCR & Storage Adapters (`packages/adapters` & `apps/worker`):**
   - [`packages/adapters/src/aws-sigv4.ts`](../../packages/adapters/src/aws-sigv4.ts), [`s3-storage.ts`](../../packages/adapters/src/s3-storage.ts), [`textract-ocr.ts`](../../packages/adapters/src/textract-ocr.ts), [`bedrock-llm.ts`](../../packages/adapters/src/bedrock-llm.ts), [`sarvam-vision-ocr.ts`](../../packages/adapters/src/sarvam-vision-ocr.ts), [`sarvam-voice.ts`](../../packages/adapters/src/sarvam-voice.ts), [`sarvam-translation.ts`](../../packages/adapters/src/sarvam-translation.ts), [`local-multimodal-ocr.ts`](../../packages/adapters/src/local-multimodal-ocr.ts), [`rule-based-extractor.ts`](../../packages/adapters/src/rule-based-extractor.ts), [`abdm-crypto.ts`](../../packages/adapters/src/abdm-crypto.ts).
   - Worker: [`apps/worker/src/index.ts`](../../apps/worker/src/index.ts), [`apps/worker/src/admin.ts`](../../apps/worker/src/admin.ts), [`apps/worker/src/bundled-migrations.ts`](../../apps/worker/src/bundled-migrations.ts), [`apps/worker/scripts/build.mjs`](../../apps/worker/scripts/build.mjs).
5. **Historical Audits & Architecture Decision Records (`docs/`):**
   - [`docs/aws-deployment-status.md`](../aws-deployment-status.md), [`docs/aws-setup.md`](../aws-setup.md), [`docs/AWS_READINESS_AUDIT.md`](../AWS_READINESS_AUDIT.md), [`docs/final-submission-verification.md`](../final-submission-verification.md), [`docs/v4-codex-independent-review.md`](../v4-codex-independent-review.md), [`docs/v4-final-test-report.md`](../v4-final-test-report.md), [`ONCOBRIEF_TWO_PAGE_SOLUTION_BRIEF_RESEARCH.md`](../research/ONCOBRIEF_TWO_PAGE_SOLUTION_BRIEF_RESEARCH.md).

---

## 2. Official AWS, AI Provider & Healthcare Regulatory Sources

1. **AWS Compute, Containers & Serverless Pricing & Documentation:**
   - [AWS Fargate Pricing (`ap-south-1` Linux x86 & ARM64)](https://aws.amazon.com/fargate/pricing/)
   - [Amazon EC2 On-Demand Pricing (`t4g` Graviton2 family)](https://aws.amazon.com/ec2/pricing/on-demand/)
   - [AWS Lambda Pricing (`ARM64` vs `x86_64`)](https://aws.amazon.com/lambda/pricing/) & [AWS Lambda Runtimes Support Schedule](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)
   - [AWS Lambda Web Adapter (`awslabs/aws-lambda-web-adapter`)](https://github.com/awslabs/aws-lambda-web-adapter)
2. **AWS Database, Storage & Encryption:**
   - [Amazon RDS for PostgreSQL Pricing (`ap-south-1` `db.t4g` & `gp3`)](https://aws.amazon.com/rds/postgresql/pricing/)
   - [Amazon Aurora Pricing (`ap-south-1` Serverless v2 ACU)](https://aws.amazon.com/rds/aurora/pricing/)
   - [Amazon RDS Proxy Session Pinning Rules for PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-pinning.html)
   - [Amazon RDS Maximum Connections Formula](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html)
   - [Amazon S3 Pricing (`ap-south-1` Standard, Glacier IR & Object Lock)](https://aws.amazon.com/s3/pricing/)
   - [AWS KMS Pricing & S3 Bucket Keys](https://aws.amazon.com/kms/pricing/)
   - [AWS Secrets Manager Pricing](https://aws.amazon.com/secrets-manager/pricing/) & [AWS Systems Manager Parameter Store Pricing](https://aws.amazon.com/systems-manager/pricing/)
3. **AWS Networking, Edge & Observability:**
   - [Amazon VPC Pricing (NAT Gateway & Public IPv4 Address Charges)](https://aws.amazon.com/vpc/pricing/)
   - [Elastic Load Balancing Pricing (`ap-south-1` ALB & LCU)](https://aws.amazon.com/elasticloadbalancing/pricing/)
   - [Amazon CloudFront Pricing](https://aws.amazon.com/cloudfront/pricing/) & [Amazon CloudFront VPC Origins Documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html)
   - [AWS PrivateLink Pricing](https://aws.amazon.com/privatelink/pricing/)
   - [Amazon CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/) & [Amazon SNS Pricing](https://aws.amazon.com/sns/pricing/)
   - [Terraform S3 Backend Native State Locking (`use_lockfile = true` in Terraform >= 1.10)](https://developer.hashicorp.com/terraform/language/backend/s3)
4. **AI, OCR & Healthcare Compliance:**
   - [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/) & [Amazon Nova Pro Model Card & Regional Inference Profiles (`apac.amazon.nova-pro-v1:0`)](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-pro.html)
   - [Amazon Textract Pricing (`DetectDocumentText` vs `AnalyzeDocument`)](https://aws.amazon.com/textract/pricing/) & [Amazon Textract Endpoints and Quotas (`ap-south-1` supported; `ap-south-2` unsupported)](https://docs.aws.amazon.com/general/latest/gr/textract.html)
   - [Sarvam AI Official API Pricing (`Sarvam Vision`, `Bulbul v3`, `Saaras v3`, `Mayura v1`)](https://www.sarvam.ai/api-pricing) & [Sarvam Vision Technical Report](https://www.sarvam.ai/blogs/sarvam-vision)
   - [NHA ABDM HIE-CM v3 Going-Live & WASA Guidelines](https://docs.abdm.gov.in/docs/hiecm/v3/getting-started/going-live)
