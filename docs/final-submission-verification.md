# OncoBrief — Final Submission Verification

**Date:** 2026-09-25
**Environment:** `oncobrief-dev` (Terraform, `infra/environments/dev`)
**Region:** `ap-south-1` (Mumbai)
**AWS account:** `375546530800`

No credentials, passwords or patient data appear in this document. Every patient
is synthetic.

---

## Product

```
Name: OncoBrief
Positioning: Source-Verified Oncology Consultation Preparation Platform
```

## Deployment

```
Frontend URL:  https://dsc1vmsr4q09g.cloudfront.net
API (app):     https://dsc1vmsr4q09g.cloudfront.net/api/v1/*   (session cookie or Cognito bearer)
API Gateway:   https://aqcq720fme.execute-api.ap-south-1.amazonaws.com  (deployed, Cognito JWT authorizer; no proxy target — the web tier is full-stack, not an API Gateway client)
AWS Region:    ap-south-1
Runtime:       ECS Fargate (private subnets) -> ALB (public, CloudFront-only on :80) -> CloudFront HTTPS
Registry:      375546530800.dkr.ecr.ap-south-1.amazonaws.com/oncobrief-dev-web
CloudFront ID: E1E7Q4M27D5UQO
```

HTTPS uses CloudFront's AWS-owned `*.cloudfront.net` certificate (no customer
domain was available). Moving to `https://app.<domain>` needs only an ACM
certificate in `us-east-1`, `aliases`, and a `viewer_certificate` block on the
distribution; no application change.

## Authentication

```
Cognito User Pool: ap-south-1_Ypc1KbaV7
Cognito Client:    5tvp1tcqpdcamb1a0ojl206afb
Cognito groups:    clinician, coordinator, records_officer, org_admin, auditor
Demo user:         dr.rao@rci.demo   (Organization: Demo Organization / "rci")
Demo patient:      DEMO-ONCO-001 — Synthetic Demo Patient
```

Two mechanisms are live against the same membership table:

- **Interactive login** — the product's native opaque-cookie session
  (`ob_session`, `HttpOnly`, `Secure` in production), verified through the
  public URL in a real browser.
- **Cognito JWT** — a `dr.rao@rci.demo` user was provisioned in the pool with
  `custom:org_id` and the `clinician` group. The token's signed claims are
  verified against the pool JWKS and then **cross-checked against the database
  membership**, so claims alone never grant tenant access.

```
Bearer (valid Cognito IdToken)  -> GET /api/v1/evidence/{id}  -> HTTP 200 (state, extractor, page, verbatim quote)
Bearer (malformed token)        -> HTTP 401
No Authorization                -> HTTP 401
```

> The browser sign-in screen uses the application's session mechanism; Cognito
> is an additive API credential (the API Gateway authorizer path). Delegating
> the interactive form to Cognito was deliberately not done, to avoid replacing
> working auth in the final phase.

## Architecture

```
Browser
  -> CloudFront (HTTPS, AWS-owned cert)
  -> Application Load Balancer (public, HTTP:80, reachable only from CloudFront)
  -> ECS Fargate  (private subnets; Next.js server)
       -> RDS PostgreSQL 16 (private; SG admits only the web task SG)
       -> S3 (private, SSE-KMS) -> SQS -> Lambda -> Textract -> Bedrock -> evidence ledger
  -> API Gateway HTTP API + Cognito authorizer (client API, deployed)
```

Security posture: RDS is not publicly accessible; S3 blocks all public access;
the web task has no public IP; CloudFront is the only HTTPS ingress; secrets
(DATABASE_URL, session secret, scoped S3 keys) are in Secrets Manager and
injected as ECS container secrets, never into the image or the browser bundle.

## Verification

| Area | Result | Evidence |
|---|---|---|
| Branding | **PASS** | Browser title `OncoBrief — source-verified record readiness`; login header, app header, docs, README; `pnpm branding:check` clean |
| Frontend | **PASS** | `https://dsc1vmsr4q09g.cloudfront.net/login` → HTTP 200; icon served; no console errors |
| Authentication | **PASS** | Session login via public URL; Cognito JWT → `/api/v1/evidence` 200; malformed/no token → 401 |
| Upload | **PASS** | Browser: `POST /api/v1/.../upload-url` 201 → direct `PUT` to S3 200 (KMS-encrypted) |
| OCR | **PASS** | Amazon Textract async analysis via the S3→SQS→Lambda path |
| LLM extraction | **PASS** | Bedrock `apac.amazon.nova-pro-v1:0`, forced tool use; provenance dialog shows `bedrock · apac.amazon.nova-pro-v1:0` |
| Evidence ledger | **PASS** | 17 seeded facts + 5 from the browser-uploaded `ob-upload-test.pdf` (doc `9bff8482-d972-4e26-99de-3d6fa86bca75`), each span-anchored |
| Human review | **PASS** | Verified (count 11→10 unverified), rejected (`rejected`, v2), corrected (`corrected` original retained + human replacement) — all from the public UI |
| Contradiction | **PASS** | Reconciliation shows both values (`10 February 2026` / `17 February 2026 at Surgical Oncology OPD`), "never resolved automatically", both source panes |
| Duplicate handling | **PASS** | Byte-identical upload → `duplicate_candidate` badge; original preserved; OCR skipped |
| API smoke | **PASS** | `pnpm smoke:api` — 11/11 against the public URL (auth, workspace, evidence provenance, upload-url, 401/400/415/404 handling) |
| Playwright — existing suite | **PASS** | 14/14 against the production image (`demo-flow` + `assistant`; fixture dataset) |
| Playwright — deployed | **PASS** | 5/5 `deployed.spec.ts` against the public URL (`E2E_DEPLOYED_CODE=DEMO-ONCO-001`) |
| Security | **PASS** | RDS private; S3 public-access blocked + SSE-KMS; least-privilege SGs; secrets in Secrets Manager; no secrets in the image/frontend |
| Clinical boundary | **PASS** | `pnpm boundary:check` clean; no diagnosis/staging/treatment/risk/urgency; every fact source-verifiable |
| Terraform | **PASS** | `fmt -check`, `validate`; plan **22 added → 0 to add / 0 to change / 0 to destroy** after apply |

### How to reproduce the checks

```bash
pnpm verify                                        # typecheck + lint + boundary + branding + tests
pnpm worker:build                                  # Lambda bundles
SMOKE_BASE_URL=https://dsc1vmsr4q09g.cloudfront.net pnpm smoke:api
E2E_SKIP_SERVER=1 \
E2E_BASE_URL=https://dsc1vmsr4q09g.cloudfront.net \
E2E_DEPLOYED_CODE=DEMO-ONCO-001 \
  pnpm --filter @oncobrief/web exec playwright test deployed.spec.ts
```

## Final result

```
SUBMISSION READY: YES
```

The public URL was opened in a real browser, the demo clinician signed in, the
demo patient loaded, a synthetic oncology PDF was uploaded from the browser
through the presigned S3 path, and the source-grounded evidence it produced was
inspected and human-reviewed — all against the deployed AWS pipeline.

## Non-blocking production-hardening items

These do not affect the prototype's correctness or the demo, but stand between
this and a real pilot:

1. **Customer domain + ACM/ALB TLS.** CloudFront's AWS-owned certificate is
   used today; a domain is preferable for a production submission.
2. **S3 credentials are a scoped IAM user**, not an ECS task role, because the
   storage adapter signs with static credentials. Teaching the adapter the
   container credential provider would remove the long-lived key.
3. **`oncobrief_app` DB password** is the prototype's fixed, documented dev
   credential (already present in the committed migration). Rotate it and load
   it from Secrets Manager only.
4. **RDS TLS** is encrypted but not certificate-verified
   (`rejectUnauthorized:false`); bundle the RDS CA to verify.
5. **Root account credentials** were used for deployment. Replace with an
   IAM/SSO principal before any further use.
6. **Cognito interactive login** is not wired to the browser form (session auth
   is the product mechanism). Cognito is used for API bearers today.
7. **No WAF, no off-box audit anchoring, no penetration test / DPDP review** —
   pilot prerequisites, unchanged from the earlier report.
