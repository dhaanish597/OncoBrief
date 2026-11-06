# Restricted hackathon deployment — November 5, 2026

> November 6 update: [the chatbot model correction](25-chatbot-model-retirement-2026-11-06.md) rolled the web task to revision 4 with a supported model. The image and earlier deployment evidence below remain the November 5 record.

## Deployment

OncoBrief is deployed at https://d1idx0s43enxlm.cloudfront.net for synthetic evaluator use. This is an internet-addressable endpoint protected by a CloudFront credential gate on every request, followed by application login and role checks. It is not a public clinical service. The user authorized using the current short-lived root session for this deployment after root role assumption failed. No long-lived root credentials were placed in the application. The newly created deployment role remains unused.

Evaluator edge credentials are stored only in the owner's local `~/.codex/private/oncobrief-hackathon/evaluator-access.json` (mode 0600). Share these privately with evaluators. Normal fictional application accounts are supplied by the synthetic login screen. Never commit the evaluator credential file or Terraform variable file.

The chosen plan is [22](22-hackathon-deployment-plan.md), with a [human/AI evaluator code map](23-hackathon-evaluator-guide.md) and [decision record](../decisions/0027-hackathon-deployment-profile.md). Historical document 21 describes the initial inspection, not the deployed topology.

## Running architecture and release identity

- Account `375546530800`, Mumbai `ap-south-1`; separate Terraform environment/state `oncobrief/hackathon/terraform.tfstate`.
- CloudFront `E209MMD8J213U3`, fully deployed; private VPC origin → internal ALB → one ARM64 Fargate task, 0.5 vCPU/1 GiB. No NAT gateway. The task has a public egress address but ingress is restricted to the internal ALB.
- ECS service `oncobrief-hackathon`: desired/running 1, completed rollout, web task definition revision 3.
- Private encrypted PostgreSQL 16.14 micro; deletion protection, seven-day backup retention and final-snapshot configuration. Runtime is non-owner, non-superuser, NOBYPASSRLS. Runtime probe verified 24 migration IDs, 75 RLS tables (64 FORCE RLS), and zero visible patients without tenant context.
- Dedicated private versioned bucket `oncobrief-hackathon-375546530800`; task-role credentials refresh automatically. No static runtime AWS keys. The runtime cannot access the RDS master secret.
- Image `375546530800.dkr.ecr.ap-south-1.amazonaws.com/oncobrief-hackathon-web:release-36cf2ba08912`, immutable digest `sha256:36cf2ba089123a3da0c1e83ae61d835284e68646eda71f1183152c6468c88868`.
- [Source manifest](hackathon-release-manifest.json): 331 build-context file hashes, checked against the working tree. Base commit `7b2edec145a9efe88f7f3928e6de975743ce33ca`; the release includes pre-existing uncommitted changes, so HEAD alone does not identify this image. Later evaluator-spec/document edits are outside the runtime image.

The synthetic initializer completed successfully in a one-off task. All migrations were applied; the initialization summary reports two organizations, three primary demo patients, 24 documents and 122 facts. Initialization refuses populated databases and does not truncate data. RDS owner initialization temporarily removes original FORCE flags inside one transaction and restores all flags before commit; exceptions roll back flags and inserts together. No bypass role is granted to runtime.

## Verification

[Machine-readable verification summary](hackathon-live-verification.json).

Local workspace suite runs passed: domain 593, adapters 135 (four opt-in skipped), database 277, worker 29, web 321: 1,355 passing tests across the recorded runs. An earlier broad database run timed out in one hook while builds were active; subsequent full database runs passed all 277. Typecheck, boundary and branding checks passed. Edge gate tests: two passed. Production-container upload/packet/auditor smoke: two passed. Four bounded live Sarvam contracts passed for synthetic OCR, translation, TTS and STT; this does not establish clinical OCR accuracy or verify every deployed provider path.

Live Chromium verification: **9/9 passed in 41 seconds** through the gated CloudFront URL. Checks covered login/workspace, provenance inspection, stored highlights/human verification, reconciliation, source inventory/duplicates, outsider denial on pages/APIs/assets, a real generated PDF upload through synchronous S3 ingestion, a source-backed task, packet approval and auditor chain/role checks. Unauthenticated readiness returned 401; authenticated readiness returned 200 with `{"status":"ok"}`. A strengthened continuity test also passed (1/1, 53.1 seconds): coordinator composition of a fresh reminder, no coordinator approval control, clinician approval, simulated outbox delivery, clinician audit denial and auditor chain verification. The evaluator suite mutates only synthetic records; those changes are retained in the ledger, not reset between reviewers.

Terraform's final refreshed plan exited 0: **No changes. Your infrastructure matches the configuration.** The provider reports a shared-module `aws_region.name` deprecation warning.

Full repository lint remains failing: **398 errors and one warning**. Most are existing repository debt; an existing `no-control-regex` finding in the modified local PDF parser also remains. No blanket suppression or unrelated automated formatting was applied. This report does not claim a clean full-repository lint run.

Reproduce the opt-in live suite with `E2E_SKIP_SERVER=1`, `E2E_BASE_URL=https://d1idx0s43enxlm.cloudfront.net`, `E2E_DEPLOYED_CODE=DEMO-001`, `HACKATHON_EVALUATION=1`, and edge username/password supplied privately as `E2E_HTTP_USERNAME`/`E2E_HTTP_PASSWORD`, then run:

```sh
pnpm --filter @oncobrief/web exec playwright test deployed.spec.ts hackathon-deployed.spec.ts --reporter=line
```

The suite intentionally changes synthetic records and appends audit events. Never point it at a real-patient environment. Both deployed specs passed targeted ESLint. Earlier live attempts exposed obsolete test assumptions (overview landing route, more than two conflict sources, relocated provenance controls, and inherited Playwright HTTP credentials in the outsider check); those tests were corrected against the actual UI, without weakening application controls.

## Preserved resources

A final read-only inspection confirmed the original bucket's `org/` prefix still contains 22 versions and zero delete markers; the bucket contains 51 total versions including preservation material. Recovery prefix `recovery/decommission-20261024/` remains. Both `oncobrief-final-20261024` and `oncobrief-predecommission-20261024` remain available and encrypted. The original document CMK is enabled. `steward-web` remains RUNNING. Legacy dev state, old Cognito and IAM users were not replaced. No old secrets were restored into this application.

## Operational boundaries and cost

Uploads use synchronous server ingestion; direct browser-to-S3 upload is disabled in this profile. No Lambda/worker, SQS or API Gateway is deployed. Extraction uses deterministic rules. Sarvam/NVIDIA secrets are configured for optional adapter capabilities; no live Bedrock extraction is claimed. NVIDIA inference and every optional deployed provider path were not independently verified. ABDM and outbound continuity delivery remain explicitly simulated. No actual patient message is sent. The private origin HTTP hop and shared edge credentials are documented synthetic-prototype trade-offs.

Budget estimate: **$55–$75/month before tax** for low-volume evaluation, plus variable provider/backup/request costs, based on the assumptions in plan 22. This is an estimate, not a cap. Infrastructure remains running for evaluation; shutdown requires a separate user instruction.

## Redeploy and rollback

Use the existing hackathon Terraform directory and the owner's private variable file; never apply the stale `dev` state. Review a saved plan before applying. Build `Dockerfile.hackathon` for `linux/arm64`, push a unique immutable image tag, record the ECR digest and regenerate/verify the source manifest before changing `image_tag`. Use short-lived IAM deployment credentials for later work where available; do not copy root credentials into files or tasks.

For subsequent schema changes, take a DB snapshot first and run the bootstrap task with `HACKATHON_BOOTSTRAP_MODE=migrate`. Do not run fresh initialization against this populated evaluator database. Wait for successful migration exit, ECS stable deployment and readiness, then rerun the opt-in browser suite. Retain the existing credential gate throughout.

For application rollback, restore the recorded image tag/task revision through Terraform and wait for readiness. Database rollback is a separate snapshot-restore operation; an image rollback does not undo schema/data changes. Preserve both old snapshots and the new evaluator ledger. To immediately close evaluator access, set `release_evaluators=false` and apply a reviewed hackathon-only plan; this disables the distribution but does not stop compute costs. Do not use `terraform destroy` as a shutdown shortcut.


## Troubleshooting

A 401 before application login is the evaluator gate: use the privately shared edge credentials. Authenticated `/api/v1/health` should return 200; a 503 indicates database/migration readiness, not an invitation to reseed. Check ECS task exit/restart events, ALB target health and CloudWatch `/ecs/oncobrief-hackathon` (`web/web/<task-id>` or `bootstrap/web/<task-id>`). Inspect safe error codes; do not dump task environment variables or Secrets Manager values. Verify database TLS, runtime role grants, migration IDs and security-group paths before changing infrastructure. A clinician receiving 403 on the audit page is expected; sign in as the synthetic auditor. Browser evaluation modifies fixture state, so compare against the ledger rather than assuming a pristine demo. Keep the distribution gated during repairs and use migrate-only mode for an already initialized database.
