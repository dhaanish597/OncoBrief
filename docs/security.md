# OncoBrief — Security

Healthcare data is treated as sensitive. This document states what the
prototype actually enforces, and what it does not.

## Tenancy

- Every tenant-scoped table carries a non-null `org_id` and a policy with both
  `USING` and `WITH CHECK`, under `ENABLE` + `FORCE ROW LEVEL SECURITY`.
- Every request opens a transaction and issues
  `SELECT set_config('app.org_id', $1, true)` (transaction-local). If the call
  is forgotten, `org_id = NULL` is never true and the query returns **zero
  rows** — it fails closed.
- Cross-tenant fetches return **404**, never 403.
- Object keys are tenant-prefixed (`org/{org}/…`) and the presigner only signs
  keys the caller's org owns.
- Integration tests seed two orgs with colliding MRNs and assert strict scoping
  and the zero-rows fail-closed behaviour.

## Authentication

- **Session mode (default):** Argon2id password hashes, opaque 256-bit tokens
  stored only as SHA-256 hashes in `session`, HttpOnly/SameSite cookies, sliding
  expiry, server-side revocation.
- **Cognito mode (opt-in):** RS256 JWT verified against the user-pool JWKS with
  issuer, audience and expiry checks. Claims are then cross-checked against the
  database membership, so `custom:org_id` and group role from a signed token
  cannot by themselves grant tenant access.

## Authorization

Three layers: route/caller resolution, the pure RBAC matrix
(`packages/domain/src/policy/rbac.ts`), and RLS. The frontend is never trusted.
`packet:approve` and `message:approve` are clinician-only; `auditor` holds no
mutating permission; `org_admin` cannot verify, correct or approve.

## Object storage

- Private bucket, versioning on, SSE-KMS with a rotating customer key, public
  access blocked.
- Reads are 60-second presigned GETs issued only after authorization, and every
  issuance writes an audit event.
- Direct uploads use a presigned PUT. The content hash is **not** trusted from
  the client: the worker downloads the object, recomputes SHA-256 and the real
  MIME type from magic bytes before any evidence is derived.

## Secrets

- No secrets in source, Terraform, or CI. `.env` is git-ignored; `.env.example`
  documents keys only.
- The RDS master password is managed by Secrets Manager
  (`manage_master_user_password`); the worker reads it via
  `secretsmanager:GetSecretValue`.
- The zero-SDK adapters read credentials from the environment, which on Lambda
  are the role's temporary credentials. IAM is least-privilege (S3 prefix,
  specific queues, specific model ARN pattern).

## Network

- RDS is private (`publicly_accessible = false`) in private subnets, reachable
  only from the worker security group.
- The worker runs in private subnets; S3 traffic uses a gateway VPC endpoint.
  Other AWS APIs use the NAT gateway by default (an interface-endpoint
  alternative is cheaper and documented in the module).

## Transport security

- **PostgreSQL TLS:** Database connections in remote environments enforce full
  certificate verification (`verify-full` equivalent: `rejectUnauthorized: true`,
  trusted CA bundle, and SNI hostname verification). Amazon RDS connections verify
  against the bundled RDS global CA certificate bundle (`packages/db/certs/rds-global-bundle.pem`).
  Custom CA certificates may be configured via `DATABASE_SSL_CA` or `DATABASE_SSL_CA_PATH`.
  The unconditional bypass (`rejectUnauthorized: false`) is removed; connections fail
  closed if SSL is requested but no trusted CA is available.
- **Edge to CloudFront:** Enforced HTTPS with `redirect-to-https` using the
  AWS-managed `*.cloudfront.net` certificate.
- **CloudFront to ALB Origin:**
  - *Current deployed state:* Uses AWS-generated ALB DNS (`*.elb.amazonaws.com`)
    with HTTP:80 origin protocol policy. The ALB security group admits only
    CloudFront origin-facing IP ranges (`com.amazonaws.global.cloudfront.origin-facing`).
  - *Hardening requirements for full origin HTTPS:* AWS ACM cannot issue certificates
    for AWS-owned `*.elb.amazonaws.com` hostnames. CloudFront-to-ALB HTTPS requires:
    1. A customer-managed domain (e.g. `origin.oncobrief.org` / `*.oncobrief.org`)
       managed via Route 53.
    2. An ACM certificate issued in the ALB region (`ap-south-1`) covering the
       custom origin domain.
    3. Route 53 CNAME / Alias record mapping the origin domain to the ALB DNS name.
    4. Supplying `origin_certificate_arn` and `custom_origin_domain` in Terraform,
       which activates the ALB HTTPS listener (port 443 with TLS 1.3/1.2),
       security group port 443 ingress, port 80 redirect to 443, and CloudFront
       `https-only` origin protocol policy.

## Audit

Two append-only, hash-chained streams. `audit_event` records actor, action,
entity, outcome, request id and correlation id, with PHI redaction:
`metadata_json` never contains document text, verbatim quotes or patient names.
`outcome = 'denied'` is recorded as prominently as success. Worker actions are
audited as `on_behalf_of = 'worker'`.

## Logging

Structured single-line JSON. `correlation_id`, `document_id`, `org_id`, stage,
duration, status and error code only. A redaction filter strips document text,
quotes, names and credentials (`apps/worker/src/logger.ts`).

## Honest gaps (not present)

No penetration test, no WAF, no GuardDuty/IDS, no backup/restore drill, no
off-box audit anchoring, no DPDP Act 2023 compliance review, no BAA-equivalent
agreements, no customer-managed key rotation drill, and no data-retention or
erasure implementation. These are pilot prerequisites and must not be described
as present.

## Local ABDM simulation assumptions

The simulated HIU consent action accepts only patients marked `is_demo_fixture`
and synthetic `@sbx` addresses. The UI labels the patient grant as simulated.
Consent and transfer states are persisted by the callback handlers, not generated
by the UI. Pulling records requires a separate authenticated, authorized action.
Imported documents remain demo fixtures and facts are never auto-verified.

Transfer private keys are wrapped with AES-256-GCM using a domain-separated key
derived from `SESSION_COOKIE_SECRET`; bare base64 private keys are refused.
Completed transfers delete the wrapped key, and temporary private-key buffers are
wiped. Rotating the session secret invalidates in-flight wrapped transfer keys.
The local filesystem retains its existing development storage policy; decrypted
sources require private encrypted object storage (SSE-KMS) for deployments with
real health information.

The loopback queue and synthetic consent context live in one web process. A
restart does not fabricate completion or replay pending events: initiate a new
synthetic request. This is a local simulator, not proof of NHA certification,
external patient consent, production webhook authentication, distributed durable
callback delivery, or independent Fidelius interoperability. Sandbox callbacks
still require a production authentication and durable worker review before real
patient use. Local loopback HTTP carries encrypted record payloads; deployed
callback URLs must use HTTPS. No external patient records were used in this test.

### Imported consent withdrawal (ADR 0018)

Revoking a consent with imported evidence preserves append-only facts and audit
history. Runtime SELECT policies hide withdrawn source facts, spans, pages,
candidates and timeline rows. Raw source objects are removed via the configured
storage adapter; source metadata remains quarantined. The source inspector and
evidence API deny further access. Request/artifact states track REVOKED or EXPIRED.
This does not erase immutable ledger content, previously approved packet snapshots,
backups or versioned object history; see ADR 0018 for the retention boundary.
