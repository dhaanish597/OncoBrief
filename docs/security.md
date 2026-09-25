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
