# SOURCED PRICING SCHEDULE (`ap-south-1` MUMBAI & EXTERNAL AI PROVIDERS)

> **Price correction:** November 5 public AWS regional price-list inspection returned ARM Fargate $0.02383/vCPU-hour and $0.00261/GB-hour for Mumbai. Treat the older compute figures below as superseded; see [the current cost estimate and sources](../21-redeployment-audit-and-plan-2026-11-05.md).

**Document ID:** `costs/pricing-sources.md`  
**Audit Date:** November 5, 2026  
**Exchange Rate:** `1 USD = ₹84.50 INR` (`730 hours/month`; prices shown excluding 18% Indian GST).

| Service | Resource / Tier | Region | Unit Price (USD) | Unit Price (INR) | Official Source URL |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **AWS ECS Fargate** | Linux `ARM64` (Graviton2) vCPU / GB | `ap-south-1` | `$0.03238/vCPU-hr` · `$0.00356/GB-hr` | `₹2.74/vCPU-hr` · `₹0.30/GB-hr` | [https://aws.amazon.com/fargate/pricing/](https://aws.amazon.com/fargate/pricing/) |
| **AWS ECS Fargate** | Linux `X86_64` vCPU / GB | `ap-south-1` | `$0.04048/vCPU-hr` · `$0.004445/GB-hr` | `₹3.42/vCPU-hr` · `₹0.38/GB-hr` | [https://aws.amazon.com/fargate/pricing/](https://aws.amazon.com/fargate/pricing/) |
| **Amazon RDS PG 16** | `db.t4g.micro` Single-AZ / Multi-AZ | `ap-south-1` | `$0.021/hr` (`$15.33/mo`) / `$0.042/hr` (`$30.66/mo`) | `₹1,295/mo` / `₹2,591/mo` | [https://aws.amazon.com/rds/postgresql/pricing/](https://aws.amazon.com/rds/postgresql/pricing/) |
| **Amazon RDS PG 16** | `db.t4g.small` Single-AZ / Multi-AZ | `ap-south-1` | `$0.042/hr` (`$30.66/mo`) / `$0.084/hr` (`$61.32/mo`) | `₹2,591/mo` / `₹5,182/mo` | [https://aws.amazon.com/rds/postgresql/pricing/](https://aws.amazon.com/rds/postgresql/pricing/) |
| **Amazon RDS PG 16** | `db.t4g.medium` Single-AZ / Multi-AZ | `ap-south-1` | `$0.084/hr` (`$61.32/mo`) / `$0.168/hr` (`$122.64/mo`) | `₹5,182/mo` / `₹10,363/mo` | [https://aws.amazon.com/rds/postgresql/pricing/](https://aws.amazon.com/rds/postgresql/pricing/) |
| **Amazon RDS Storage** | General Purpose SSD (`gp3`) Single-AZ | `ap-south-1` | `$0.131 / GB-month` | `₹11.07 / GB-month` | [https://aws.amazon.com/rds/postgresql/pricing/](https://aws.amazon.com/rds/postgresql/pricing/) |
| **Amazon Aurora v2** | Serverless v2 ACU (`0.5 ACU` min floor) | `ap-south-1` | `$0.145 / ACU-hr` (`$52.93/mo` floor) | `₹4,473/mo` floor | [https://aws.amazon.com/rds/aurora/pricing/](https://aws.amazon.com/rds/aurora/pricing/) |
| **Amazon VPC** | Managed NAT Gateway + Public IPv4 | `ap-south-1` | `$0.056/hr` (`$40.88/mo`) + `$0.005/hr` (`$3.65/mo` IPv4) | `₹3,454/mo` + `₹308/mo` | [https://aws.amazon.com/vpc/pricing/](https://aws.amazon.com/vpc/pricing/) |
| **AWS ELB** | Application Load Balancer (Base + LCU) | `ap-south-1` | `$0.0239/hr` (`$17.45/mo`) + `$0.008/LCU-hr` | `₹1,475/mo` + `₹0.68/LCU-hr` | [https://aws.amazon.com/elasticloadbalancing/pricing/](https://aws.amazon.com/elasticloadbalancing/pricing/) |
| **Amazon S3 & KMS** | S3 Standard + KMS CMK | `ap-south-1` | `$0.025 / GB-mo` + `$1.00 / CMK-mo` | `₹2.11 / GB-mo` + `₹84.50 / CMK` | [https://aws.amazon.com/s3/pricing/](https://aws.amazon.com/s3/pricing/) |
| **Amazon Textract** | `DetectDocumentText` vs `AnalyzeDocument` | `ap-south-1` | **`$0.0015/page`** vs `$0.015` (Tables) / `$0.065` (Tables+Forms) | `₹0.127/page` vs `₹5.49/page` | [https://aws.amazon.com/textract/pricing/](https://aws.amazon.com/textract/pricing/) |
| **Amazon Bedrock** | `apac.amazon.nova-pro-v1:0` / `nova-lite-v1:0` | `ap-south-1` | Pro: `$0.00084/1K in`, `$0.00336/1K out`<br>Lite: `$0.000063/1K in`, `$0.000252/1K out` | Pro: `₹0.071/1K in`, `₹0.284/1K out` | [https://aws.amazon.com/bedrock/pricing/](https://aws.amazon.com/bedrock/pricing/) |
| **Sarvam AI** | `Sarvam Vision` / `Bulbul v3` / `Saaras v3` / `Mayura v1` | India | Vision: `$0.0059/p` · TTS: `$0.0355/1K` · STT: `$0.0058/m` · Trans: `$0.0237/1K` | Vision: `₹0.50/p` · TTS: `₹3/1K` · STT: `₹0.49/m` · Trans: `₹2/1K` | [https://www.sarvam.ai/api-pricing](https://www.sarvam.ai/api-pricing) |
