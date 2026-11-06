# OncoBrief redeployment: live audit and approval plan

Date: November 5, 2026 (Asia/Kolkata). Status: **historical initial audit; superseded by the authorized hackathon plan 22 and deployed release report 24**.

## Scope and evidence

Read the project rules, product reference documents, AWS documents `00`–`20`, cost assumptions, six diagrams, historical setup/status guides, Terraform, Docker/CI configuration, worker packaging, migrations, and application provider wiring. The existing modular Terraform architecture remains the basis of this plan. No new hosting platform or application rewrite is proposed.

This audit used read-only AWS CLI calls after user-authorized `aws login`. Account: `375546530800`; configured and inspected deployment region: `ap-south-1` (Mumbai). The renewed identity is `arn:aws:iam::375546530800:root`. Account summary reports root MFA enabled and root access keys present; this is a presence indicator, not a count. No credential or secret values are included here.

Checkout HEAD: `7b2edec145a9efe88f7f3928e6de975743ce33ca`, with extensive pre-existing modified and untracked application files. Any release must identify the exact reviewed working-tree contents; tagging an image with HEAD alone would misrepresent its source. No application source changes were made during this inspection.

## Live AWS inventory

| Resource | Verified result | Proposed treatment after approval |
| --- | --- | --- |
| Documents bucket `oncobrief-documents-dev` | Mumbai; versioning enabled; all four bucket public-access blocks enabled; SSE-KMS and Bucket Keys already enabled; 22 versions under `org/`, no delete markers | Reuse without deleting or replacing objects; preserve `recovery/` separately from application access |
| Recovery prefix | `recovery/decommission-20261024/` exists | Preserve; do not unpack archived secrets into logs or application images |
| State bucket `oncobrief-tfstate-375546530800` | Versioning and all four bucket public-access blocks enabled | Reuse; securely back up state before approved reconciliation |
| State key `oncobrief/dev/terraform.tfstate` | Serial 24, Terraform 1.16.2, 82 managed resources; last modified September 25; still records the deleted DB, ECS service and old CloudFront distribution | Stale historical state, not a live inventory; reconcile retained objects and removed resources before apply |
| Document KMS CMK | `bb27fe5e-bd3e-46c6-a496-c4187ebec246`, enabled | Reuse; do not schedule deletion or replace |
| RDS snapshots | `oncobrief-final-20261024` and `oncobrief-predecommission-20261024`: available, encrypted, PostgreSQL 16.14, 20 GB | Preserve both; restore final snapshot to a new private DB instance |
| Snapshot KMS key | `ecfa26da-904b-4e89-85c9-e725aa1610f8`, enabled, AWS-managed | Retain access for restore; distinct from document CMK |
| Cognito | Pool `ap-south-1_Ypc1KbaV7`, client `5tvp1tcqpdcamb1a0ojl206afb` still exist | Retain; staff web authentication remains existing PostgreSQL sessions |
| IAM | Four OncoBrief service roles and `oncobrief-dev-web-storage` user remain | Review and reuse appropriate service roles; new web task role replaces runtime dependence on static user keys; no user/key deletion included |
| Web secret `oncobrief-dev-web` | Listed with October 24 deletion timestamp | Do not treat as usable; verify recoverability before any approved restore, otherwise create a newly named secret with fresh values |
| Main application infrastructure | No RDS instances, ECS clusters, ALBs, OncoBrief ECR repo, OncoBrief Lambda functions, queues, SNS topics, API Gateway APIs, NAT gateways or VPC endpoints found in Mumbai | Recreate approved missing components through Terraform |
| VPC | Only default `172.31.0.0/16` VPC found; dedicated `10.60.0.0/16` absent | Recreate dedicated OncoBrief VPC and subnets |
| CloudFront | No distributions listed globally | Create a new distribution; historical hostnames cannot be promised |
| DNS and certificates | No Route 53 hosted zones; no ACM certificates listed in Mumbai or `us-east-1` | Domain/certificate decision required for HTTPS origin; external DNS ownership was not inspected |
| Monitoring | No OncoBrief alarms or worker log groups; no CloudTrail trails listed; account-level S3 public-access configuration absent | Recreate scoped operational monitoring; account-wide controls require separately scoped approval |
| Other application | `steward-web` App Runner service is `RUNNING`; its ECR repository exists | Outside this deployment; preserve unchanged |

Document bucket has no bucket policy and no notifications. Public-access blocks do not themselves enforce TLS. Add a TLS-only deny policy after approval; scope the web/worker S3 permissions to application objects, excluding recovery archives.

Bedrock lists `apac.amazon.nova-pro-v1:0` as active with destinations in Mumbai, Sydney, Tokyo, Seoul, Singapore and Osaka. Catalog presence does **not** prove invocation permissions, payment readiness, or successful inference. No billable AI/OCR call was made. Sarvam/NVIDIA secrets and live provider behavior were not tested.

## Local verification performed

| Check | Actual result |
| --- | --- |
| Toolchain | Node 24.21.0; pnpm 9.15.4; Terraform 1.16.6; AWS CLI 2.38.2 |
| `pnpm typecheck` | Passed across workspaces |
| `pnpm lint` | Failed: 398 errors and 1 warning, including application/test code and generated presentation/video files |
| `pnpm boundary:check` | Passed, clean |
| `pnpm branding:check` | Passed |
| Domain tests | 593 passed |
| Adapter tests | 131 passed; 4 live-provider tests skipped |
| Worker tests | 29 passed |
| `pnpm --filter @oncobrief/web build` | Passed |
| `pnpm worker:build` | Passed, but package is incomplete: only 19 migrations and no copied RDS CA bundle |
| `terraform -chdir=infra/environments/dev validate` | Passed against installed providers |
| Container build / database integration / browser E2E | Not run; Docker daemon unavailable at the configured Colima socket. No shared database was reset or migrated |
| Live application smoke tests | Not possible: no live OncoBrief application exists |

These checks do not reproduce the historical 1,304-check claim. `pnpm verify` cannot currently pass because lint fails. Docker uses Node 22, so the local Node 24 build does not replace the required Linux ARM64 container verification.

## Corrections required before deployment

1. **Migrations:** generate bundle imports from all 23 SQL files, copy the RDS CA, target Node 22, and test bundle/CLI migration parity. Read restored `schema_migration` before deciding which migrations are pending. Snapshot schema contents have not been inspected.
2. **Database TLS and secrets:** remove admin Lambda's two `rejectUnauthorized: false` paths. Resolve trusted CA correctly in the Lambda filesystem. Rotate the restored application role password, use a non-owner `NOBYPASSRLS` runtime role, and resolve secret references at runtime. Do not place a credential-bearing `DATABASE_URL` directly in Lambda configuration. Disable production `.env.example` fallback and insecure required-value defaults.
3. **AWS credentials:** use an ECS task role with refreshable container credentials across S3, OCR, Bedrock and queue adapters. Passing a session token is already implemented in current storage wiring; the missing part is role credential acquisition/refresh and provider selection without static environment keys.
4. **Upload ownership:** synchronous web ingestion and async S3 notifications currently share the `org/` prefix. Existing ready/quarantined/job-state guards do not establish atomic ownership between web and worker. Select a single owner per upload and test concurrent/retried delivery; do not skip all non-pending jobs blindly, which could suppress valid retries. Exclude TTS/cache objects from ingestion notifications.
5. **Readiness:** implement a bounded DB/migration readiness endpoint; middleware already exempts `/api/v1/health`, but the route does not exist. Current ALB probes `/login`. Verify migration identities and expected policies, not merely a total table count.
6. **Terraform safety:** add snapshot-restore input, prevent destruction of retained S3/KMS resources, disable bucket `force_destroy`, enable DB deletion protection/final snapshot, configure backups and scoped security groups. Reconcile stale state without overwriting the historical backup. No `terraform destroy` or blind `state rm`.
7. **Network and TLS:** retain a single managed NAT initially because private worker/admin Lambdas need AWS/external API egress. Implement documented internal ALB + CloudFront VPC origin. The user selected a CloudFront URL for a synthetic demo. The proposed demo variant has public viewer HTTPS and private HTTP from CloudFront to the internal ALB; it is **not end-to-end TLS**. This transport exception is included explicitly in the approval scope, not yet applied. A later deployment with sensitive data requires approved origin TLS/domain configuration.
8. **Worker limits:** Node 22 ARM64, configurable DB pools (web 8, worker 2), maximum SQS concurrency 5 per mapping, explicit retry/DLQ behavior and batch limits. For 180-second workers use at least 1,080-second queue visibility plus any batch window, rather than the documents' 900 seconds. For retained 300-second workers use at least 1,800 seconds plus any batch window.
9. **Packaging and quality:** limit Docker build context to reviewed runtime source; exclude reports, slide artifacts, local recovery/configuration and secrets; run as non-root. Resolve relevant lint failures without unrelated refactoring; separate generated artifacts from application lint scope with a justified configuration change. Update CI Terraform minimum to >=1.10 for native S3 locking.
10. **Provider configuration:** explicitly wire OCR/extraction and permitted model IDs, optional secret-backed Sarvam configuration, `ABDM_DRIVER=simulated` and `DELIVERY_DRIVER=simulated` for synthetic verification. Avoid sending identifiable restored records to APAC inference. Preserve human verification, contradiction handling, approval, provenance and audit rules. Textract currently requests TABLES+FORMS while normalization consumes LINE blocks; validate text-detection API equivalence and permissions before claiming the cheaper processing rate.

## Proposed deployment and approval scope

Initial release is a **synthetic validation deployment**, not approval to process real patient records. Preserve all restored data; do not run demo reset or seed over restored organizations. Synthetic smoke records must use dedicated organizations and source files. Inspect restored fixture classification privately before release; deny demo access to any restored organization/data whose synthetic status is unverified. If safe synthetic isolation cannot be demonstrated, do not open public application access.

1. Finish local blockers and run locked dependency/container build, lint/type checks, worker/unit tests, isolated PostgreSQL 16 integration/migration tests, and browser demo tests. Record the exact reviewed source manifest and use immutable image digests. No infrastructure changes if these gates fail.
2. Establish a scoped non-root deployment role/session. Any role creation is part of the approved OncoBrief deployment scope; root-key deletion and unrelated account-wide changes are excluded.
3. Back up and reconcile existing Terraform state against the inventory. Retain/import surviving S3, KMS, Cognito and service IAM objects as needed. Review a refreshed saved plan with no destruction of retained data or unrelated resources. A saved apply plan has not yet been produced; current source is not ready to yield an approvable apply artifact.
4. Recreate missing dedicated VPC, two public/two private subnets, IGW, one NAT/EIP, routes, free S3 gateway endpoint, private DB subnet/security groups, internal ALB, ECR, ECS, worker queues/DLQs/SNS/Lambdas, scoped logs/alarms/alert topic, task role and secret references. Keep existing Cognito; defer rebuilding unused API Gateway. No NAT instance, new platform, WORM compliance retention or automatic message delivery is included.
5. Restore `oncobrief-final-20261024` into private PostgreSQL 16.14 `db.t4g.micro`, 20 GB gp3, with deletion protection and 14-day backups. Confirm parameter/role behavior after restore; keep both original snapshots. Recreate administrator secret management as supported by the restore path.
6. Inspect migration history, take and verify a fresh pre-migration snapshot, rotate runtime credentials securely, deploy the corrected admin bundle and apply only missing reviewed migrations through private access. Verify forced RLS, tenant denial and ledger integrity. Do not assume the snapshot stops at migration 0007 or 0019.
7. Push Linux ARM64 web image, deploy one 0.5-vCPU/1-GB task and Node 22 ARM64 workers, and verify private DB/storage/API connectivity. If provisioning needs multiple Terraform stages for ECR/image/DB bootstrap, review each stage; do not route users to an empty image or unmigrated database.
8. Configure a new AWS-owned CloudFront viewer HTTPS hostname, private VPC origin and internal HTTP ALB for the approved synthetic-only variant. Default dynamic caching disabled; private/no-store browser headers; static cache only for `/_next/static/*`. Restrict S3 CORS to the actual application origin. No custom domain, ACM certificate or DNS zone is included. No old live traffic exists to switch.
9. Test HTTPS, session authentication/RBAC, unauthenticated denial, two-tenant isolation, synthetic upload/retrieval and exact source spans, OCR/extraction, verification/reconciliation, source-backed task, approved packet/export and simulated approved continuity message with audit trail. Run scoped provider probes only as approved; distinguish cloud provider responses from deterministic fallbacks. Inspect redacted logs, queue age/DLQs and ECS target health before declaring success.

## Cost estimate for this executable topology

Planning assumptions: 730 hours/month, one 0.5-vCPU/1-GB ARM64 Fargate task, micro DB with 20 GB gp3, internal ALB, one managed NAT/EIP, low synthetic traffic. No promotional credits or free-tier discounts assumed. This preserves the existing Lambda architecture and costs more than the incomplete NAT-free example.

| Component | Monthly USD |
| --- | ---: |
| Fargate ARM64 (vCPU $0.02383/h; memory $0.00261/GB-h) | 10.60 |
| RDS micro compute + 20 GB gp3 | 17.95 |
| Internal ALB base, before LCUs | 17.45 |
| Managed NAT gateway | 40.88 |
| NAT public IPv4 | 3.65 |
| Retained KMS CMK | 1.00 |
| Two Secrets Manager secrets allowance | 0.80 |
| Core fixed total (unrounded inputs summed) | **92.33** |
| Low-volume logs, requests, snapshots/storage, LCUs, transfer allowance | 5–15 |
| Planning range before AI/provider use, tax and FX | **97–108/month** |

Allow approximately **$100–$120/month** for low-volume synthetic operation including a small provider-test allowance. This is an estimate, not a spending cap. NAT data processing, CloudFront usage, additional retained backup growth, worker duration, scale-out, burstable DB CPU credits, and paid OCR/voice can exceed it. NAT is the largest fixed cost. Existing `steward-web` charges are excluded. A later separately approved NAT-free worker topology can reduce this after testing; disabling NAT alone cannot.

Regional rates were checked against official public AWS price lists on November 5, with deterministic decimal arithmetic. Fargate rates differ from `07`/`costs/pricing-sources.md`; those older figures should not be reused as current quotes. Sources: [ECS Mumbai price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-south-1/index.json), [RDS Mumbai price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-south-1/index.json), [ELB Mumbai price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/ap-south-1/index.json), [VPC Mumbai price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonVPC/current/ap-south-1/index.json). NAT hourly price was also verified via AWS Pricing `GetProducts` (`AmazonEC2`, `APS3-NatGateway-Hours`). KMS/secrets figures are planning allowances; final bill depends on actual configuration and usage.

## Rollback and troubleshooting

- Before first release there is no running OncoBrief version to roll back to. Keep traffic closed if any gate fails; preserve restored DB, snapshots and document versions. After a successful release, retain task-definition revision and image digest for ECS rollback with the circuit breaker enabled.
- Database rollback is not an automatic down migration or overwrite. Restore the pre-migration snapshot to a separate private instance, verify data/integrity, then request approval before changing the application endpoint. Preserve the failed instance for investigation; account for writes after the backup.
- An unhealthy target requires checking readiness response, migration history, task architecture/native dependencies, role/secret references, CA path, SGs and private routes. OCR failures require inspecting redacted worker logs, queue age, DLQ, notification permissions and provider errors. Do not replay all retained S3 documents or redrive DLQs automatically.
- Future deployments use the same gates: reviewed immutable source/image, full bundle migration parity, saved Terraform diff, pre-migration snapshot, private migration, ECS rollout, live smoke tests and retained rollback revision. Never use a dirty HEAD SHA as proof of released contents.

## Decisions needed from the user

- Approve the above OncoBrief-only restore/recreate scope and estimated recurring spend before any infrastructure/state changes, production migration or traffic release.
- The user selected a CloudFront URL for a synthetic demo. Approve the explicit transport scope: public HTTPS, private HTTP origin, synthetic-only access. This does not authorize sensitive-data processing over that origin path.
- Alert email and live-provider credentials can be supplied through secure configuration later; never paste keys into this document. Restored data is preserved regardless of synthetic verification mode.

Technical references: [CloudFront VPC origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html), [origin HTTPS certificate requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-cloudfront-to-custom-origin.html), [private Lambda internet access](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html), [SQS/Lambda visibility requirement](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-lambda-function-trigger.html).
