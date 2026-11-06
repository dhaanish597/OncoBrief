# Hackathon prototype deployment plan

November 5, 2026. Supersedes the production-pilot sizing and restore proposal in document 21. The user explicitly clarified hackathon-only scope and authorized selecting and deploying the appropriate plan. This is not authorization for anonymous public access or real patient data.

## Decision

Retain the existing Next.js modular monolith, PostgreSQL/RLS evidence ledger, adapter interfaces and Terraform. Use a separate `infra/environments/hackathon` and remote state key `oncobrief/hackathon/terraform.tfstate`; do not reconcile or apply the stale `dev` state. Deploy one ARM64 Fargate web task (0.5 vCPU/1 GiB), private RDS micro, private S3 storage, internal ALB and CloudFront VPC origin. No NAT gateway, Lambda ingestion deployment, API Gateway, Cognito replacement or new clinical-production infrastructure.

The current web ingestion path already performs storage → OCR → extraction → provenance validation → ledger synchronously. Use that path exclusively in this prototype; no S3 ingestion notifications means no concurrent worker collision. Cloud worker code remains in the repository as an optional separately deployable path, clearly identified as not deployed in this profile. Fargate uses a public egress address with ingress allowed only from the internal ALB. RDS remains private. Public viewer TLS uses the AWS CloudFront certificate; the internal origin hop uses HTTP for synthetic data only.

Evaluator access uses the user-selected CloudFront URL with restricted authenticated HTTPS. Add an edge credential gate on every CloudFront behavior, including assets, then retain normal application roles/sessions. Store only a hash in edge code; do not expose evaluator passwords in source, outputs, or logs. The ALB cannot be reached directly from the internet. This is an internet-addressable but access-restricted endpoint, not a publicly available application.

Create an empty database for this profile and seed only synthetic fixtures with a non-destructive, empty-database-only initializer. Do not restore older data into the evaluator environment. Keep both existing encrypted snapshots, the original 22 object versions, recovery archive, legacy state, Cognito, IAM users and Steward unchanged. A dedicated new S3 bucket isolates synthetic uploads and limits the new task role to that bucket; retain the enabled document CMK through a data reference. New database secrets use Secrets Manager. Runtime role is non-owner/NOBYPASSRLS; no static AWS keys in runtime.

## Implementation tasks

- [x] Add tested refreshable ECS task credentials for deployed storage signing; preserve static credential compatibility for deterministic local tests.
- [x] Add a tested empty-database-only synthetic initializer without weakening the existing loopback-only reset safeguard. All 24 migrations (including the new runtime-readiness metadata grant) are applied from disk in a one-off private-connected task; no incomplete Lambda bundle is used.
- RDS compatibility: initialization runs as the non-superuser schema owner in one transaction, temporarily clears only the original FORCE-RLS flags while inserting empty-database fixtures, and restores every original flag before commit. Any failure rolls back both data and flags. Runtime never receives BYPASSRLS. Local tests exercise this owner path and the non-empty-database refusal. Password rotation does not attempt superuser-only attribute changes.
- [x] Add a bounded DB/migration readiness route. Production configuration must not load `.env.example` or fall back to development DB/session secrets.
- [x] Add isolated Terraform environment and narrow runtime/build context. Deploy only the web ingestion path. The user explicitly selected the current short-lived root session after AWS rejected root role assumption; use an account-locked provider and avoid unrelated IAM/account changes. The newly created deployment role is currently unused.
- [x] Provision database, S3, ECR and networking; build/push immutable Linux ARM64 image; run one-off migrate/initialize task; activate web service only after readiness passes.
- [x] Run unit, PostgreSQL integration and core browser workflow tests using a disposable local DB. Run targeted lint for changed files; report pre-existing full-repository lint failures honestly rather than suppressing application rules.
- [x] Run live synthetic smoke tests through evaluator access and verify outsiders are denied. Check source inspection, human verification, contradictions, task, packet, continuity approval and audit trail.
- [x] Publish a release manifest and evaluator guide: deployed vs optional components, evidence flow, source locations, exact test results, provider mode/limitations, access, redeployment and rollback.

## Providers and claims

Use deterministic extraction as the reliable baseline. Configure existing Sarvam/NVIDIA secrets securely if available; verify bounded synthetic provider calls and report fallback distinctly. ABDM and outbound message delivery remain explicitly simulated; no actual patient communication. Do not claim live Bedrock extraction, clinical deployment, regulatory certification, production SLA, or full-suite success without evidence. AI evaluators should be able to follow a fact from document through spans, validation, reviewer state, ledger and downstream packet/task directly in the code.

## Cost and rollback

Using previously verified Mumbai regional rates and 730h/month: Fargate $10.60 + RDS micro/20GB $17.95 + internal ALB $17.45 + task IPv4 $3.65 + CMK $1 + two-secret allowance $0.80 = $51.45/month before variable usage. Plan approximately $55–$75/month for low-volume evaluation, taxes excluded; provider calls, backups and requests vary. No NAT hourly cost. This is a planning estimate, not a hard spending cap.

Retain immutable image digest/task revision for rollback. Before later schema changes take a snapshot. Never destroy the legacy resources or snapshots. Failed first deployment stays access-restricted; fix and redeploy. Stop costs after evaluation only on user instruction, with retained data/snapshots considered separately.
