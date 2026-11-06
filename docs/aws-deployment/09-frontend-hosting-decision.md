# AGENT 9 — FRONTEND HOSTING AND EDGE DELIVERY DECISION

**Document ID:** `09-frontend-hosting-decision.md`  
**Repository Root:** `/Users/dhaanish/Documents/OncoBrief`  
**Audit Date:** November 5, 2026  
**Role:** Agent 9 — Frontend Hosting and Delivery Specialist  

---

## 1. Executive Summary & Architectural Decision (`[VERIFIED]`)

**Decision:** Keep `apps/web` (`@oncobrief/web`, Next.js 15 App Router + React 19) as a **single unified full-stack container** running on **AWS ECS Fargate Graviton2 (`ARM64`)** behind **Amazon CloudFront** (using **CloudFront VPC Origins** to reach an internal ALB over HTTPS, with an explicit `/_next/static/*` edge cache behavior and strict `Cache-Control: private, no-store, no-cache, must-revalidate` headers on all dynamic HTML, RSC, Server Action, and `/api/v1/*` routes).

Do **not** split `apps/web` into a separate S3 static SPA and a separate backend microservice:
1. All 18 clinical and patient-portal pages under `apps/web/src/app/(app)/` are dynamic React 19 Server Components that query PostgreSQL 16 directly via `withTenant()` (`packages/db/src/client.ts:192-215`).
2. All 24+ clinical workflow mutations in `apps/web/src/lib/actions.ts` and `opd-actions.ts` are Next.js Server Actions sharing the same `appPool` (`max: 8–10`) and `ob_session` cookie validation.
3. Adding a second CloudFront cache behavior for `/_next/static/*` gives 100% of the CDN offload benefit of an S3 static split with **zero code rewrites**.

---

## 2. AWS Frontend Hosting Comparison for `apps/web` (`[VERIFIED]`)

| Hosting Approach | Monorepo & `@node-rs/argon2` Support | Private RDS Connectivity | Large PDF Upload (`25 MB`) | Monthly Fixed Cost (`ap-south-1`) | Verdict |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **1. CloudFront + CloudFront VPC Origin + Internal ALB + ECS Fargate `ARM64` (`0.5 vCPU / 1 GB`)** | **100% Native** (`Dockerfile`) | **Direct in-VPC** + warm `pg.Pool` (`15–40 ms` SSR) | **Supported** (Presigned S3 PUT + 25 MB multipart) | **`$31.87/mo`** (`$14.42` Fargate + `$17.45` Internal ALB; `$0` NAT, `$0` ALB EIPs) | **Selected for Single-Hospital Pilot & Multi-Hospital Prod (Arch B & C)** |
| **2. CloudFront + Public-Egress Fargate `ARM64` (`0.25 vCPU / 0.5 GB`) or Lambda Web Adapter** | **100% Native** | **Direct in-VPC** | Presigned S3 PUT required for `>6 MB` on LWA | **`$7.21–$10.86/mo`** (Fargate) or **`$0.00/mo` idle** (LWA) | **Selected for Demo / Hackathon (Arch A)** |
| **3. AWS Amplify Hosting (SSR Compute)** | **Fragile** (`transpilePackages` + native `.node` binary + `.pem` bundle) | **Blocker:** Managed SSR runs outside private VPC subnets | **Fails `>6 MB`** (`HTTP 413` Lambda payload ceiling) | `~$10–$20/mo` (+ `$21.90/mo` RDS Proxy workaround) | **Rejected** |
| **4. Split S3 Static Frontend + Separate Backend API** | Breaks 18 RSC pages & 24+ Server Actions (`3,000+` line rewrite) | Requires backend container anyway | Requires backend API | `~$25–$40/mo` | **Rejected** |

---

## 3. PHI Cache-Prevention & Edge Security Audit (`infra/modules/web/main.tf:302-345`) (`[VERIFIED]`)

### 3.1 Verified Strengths in Current `infra/modules/web/main.tf`
- `default_cache_behavior` (`lines 315–325`) uses `Managed-CachingDisabled` (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`) and `Managed-AllViewer`, guaranteeing that CloudFront **never caches patient-specific HTML, RSC payloads, Server Actions, or `/api/v1/*` JSON responses** at edge POPs.

### 3.2 Three Critical Edge Flaws & Required Terraform Fixes (`[RECOMMENDED]`)
1. **P0 Flaw — Plaintext `http-only` Origin Transit (`infra/modules/web/main.tf:307`):**
   - Currently, `origin_protocol_policy = var.origin_certificate_arn != "" ? "https-only" : "http-only"`. When deployed without a custom domain (`https://d1be3997j8s23s.cloudfront.net`), traffic between CloudFront and the public ALB flows over unencrypted `HTTP:80`.
   - **Fix:** Provision an internal ALB (`internal = true`) with an `aws_cloudfront_vpc_origin` and ACM TLS certificate (`origin_protocol_policy = "https-only"`, `origin_ssl_protocols = ["TLSv1.2"]`), plus a secret `X-Origin-Verify` custom header verified by an ALB listener rule.
2. **P1 Flaw — Missing Browser-Side `Cache-Control: private, no-store` Header Policy:**
   - While `Managed-CachingDisabled` stops CloudFront edge caching, shared hospital clinic PCs could cache HTML in local browser disk cache on back-button navigation after logout unless `Cache-Control: private, no-store, no-cache, must-revalidate` is sent.
   - **Fix:** Attach an `aws_cloudfront_response_headers_policy` to `default_cache_behavior` setting `Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: SAMEORIGIN`.
3. **P2 Optimization — Missing `/_next/static/*` Edge Cache Behavior:**
   - Add an `ordered_cache_behavior` for `path_pattern = "/_next/static/*"` using `Managed-CachingOptimized` (`658327ea-f89d-4fab-a63d-7e88639e58f6`) with cookies stripped (`origin_request_policy_id = null`), offloading ~85% of asset requests from the Fargate container at `$0.00` CloudFront Free Tier cost.
