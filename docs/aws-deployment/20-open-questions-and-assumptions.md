# PHASE 11 — OPEN QUESTIONS, UNKNOWNS & EDITABLE ASSUMPTIONS

**Document ID:** `20-open-questions-and-assumptions.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  

---

## 1. Key Open Questions for Operator / Hospital Decision-Makers

None of the items below block the architectural selection (`Architecture B` in `ap-south-1`), but they must be confirmed before cutting over to a live hospital pilot with real patient data:

| # | Question / Decision Area | Default Assumption Used in Plan | Impact if Changed |
| :---: | :--- | :--- | :--- |
| **1** | **Custom Production Domain & ACM Certificate** | Uses `https://d1be3997j8s23s.cloudfront.net` for Demo; assumes a custom domain (e.g., `app.oncobrief.in`) + Route 53 Hosted Zone (`$0.50/mo`) + free ACM certificate in `us-east-1` (CloudFront) and `ap-south-1` (ALB) for Pilot. | If no custom domain is used, use **CloudFront VPC Origin** (`aws_cloudfront_vpc_origin`) so CloudFront-to-ALB traffic does not require a public DNS ACM certificate. |
| **2** | **Strict Single-Region (`ap-south-1`) vs. APAC Geo Cross-Region Bedrock Inference** | Assumes strict Indian data residency is required for real hospital PHI under NCG/ABDM policies: either use an in-region `ap-south-1` model ID (`aws:RequestedRegion = "ap-south-1"`), strip direct demographic headers before calling `apac.amazon.nova-pro-v1:0`, or use India-resident `Sarvam Vision` + `RuleBasedExtractor`. | If the hospital DPA explicitly permits encrypted stateless inference within APAC AWS regions (Tokyo/Singapore/Sydney), `apac.amazon.nova-pro-v1:0` can be invoked without header stripping. |
| **3** | **Outbound Telecom SMS / WhatsApp Aggregator (`DELIVERY_DRIVER`)** | Currently uses `SimulatedDeliveryAdapter` (`ADR 0011`, `$0.00/mo`) or `WebhookDeliveryAdapter`. | Live SMS/WhatsApp reminders in India require TRAI DLT header/template registration and an aggregator account (e.g., Gupshup, Exotel, or AWS End User Messaging SMS at `~₹0.15–₹0.50/message`). |
| **4** | **NHA ABDM Production Gateway vs. Loopback Mode (`ABDM_DRIVER`)** | Uses `ABDM_DRIVER=simulated` (real local `Curve25519` + `AES-256-GCM` Fidelius crypto over in-process loopback) until NHA Sandbox & CERT-In WASA certification are completed. | Switching to `ABDM_DRIVER=sandbox` or live production requires NHA client credentials (`ABDM_CLIENT_ID`, `ABDM_CLIENT_SECRET`) and a static whitelisted egress IP or callback domain. |
| **5** | **AWS Promotional Credits / Activate Credits** | All primary cost tables assume **$0.00 in promotional credits** and **no temporary 12-month AWS Free Tier** discounts. | If AWS Activate / Hackathon credits (`$1,000–$5,000`) are active on Account `375546530800`, they cover 100% of AWS infrastructure, Textract, and Bedrock charges (`~$77–$107/mo`), leaving only external Sarvam API usage (`~$6.50–$41.99/mo`). |

---

## 2. Explicit Editable Workload Assumptions

All financial and performance models in `07-aws-cost-analysis.md`, `08-performance-scaling-plan.md`, and `costs/aws-cost-model.csv` are parameterized by the following variables (documented in `costs/workload-assumptions.md`):
- **Exchange Rate:** `1 USD = ₹84.50 INR` (pre-GST; add `18%` for Indian GST).
- **Clinic Hours:** `6 hours/day` peak OPD window (`08:30–14:30 IST`), `25 clinic days/month`.
- **Average Document Size:** `4 pages/document` (`1.2 MB` average PDF size); `~1.67` documents per consultation (`2,500 docs` / `1,500 consultations` per month for a 100-user hospital).
- **Document Modality Mix (Base Case):** `10%` byte-identical duplicate uploads (skipped via `content_sha256`), `20%`–`40%` born-digital PDFs/FHIR bundles (`$0.00` local parser), `50%`–`70%` printed English scans (Textract `DetectDocumentText` at `$0.0015/page`), `10%` Indic-script or degraded handwritten scans (`Sarvam Vision` at `₹0.50/page`).
