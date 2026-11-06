# Health-a-thon repository integration plan

Date: 2026-11-06. Authorization: organize all repository materials, merge outstanding branches, verify and push to GitHub main.

## Goal and constraints

Preserve all application work and branch history, make main contain web, worker, mobile, extension and deployment source, and provide one submission entry point. Keep credentials, local databases, generated native projects and transient build output private/untracked. Preserve the Evidence Ledger, provenance, human approval and non-clinical boundaries in CLAUDE.md. No deployment or database reset of existing environments is authorized by this repository release.

## Execution

- [x] Preserve current eligible files and all Git refs outside the repository; fetch remote refs and inventory branches/worktrees.
- [x] Review eligible files for credentials/build output; commit existing application and supporting work in focused groups before merging.
- [x] Merge oncobrief-patient-app, retaining its API security fixes and CI gate alongside newer local upload/readiness/FHIR work; confirm every other branch is an ancestor.
- [x] Organize research, historical plans and presentation assets; add docs/README.md and submission/README.md. Keep existing cross-document entry paths as forwarding notes when moved.
- [x] Correct README deployment/runtime/mobile guidance and CI/runtime mismatches. Run frozen installation, typecheck, lint, tests, worker/web builds, mobile exports and relevant browser flows with an isolated disposable PostgreSQL cluster.
- [x] Record exact results and remaining limits in submission/RELEASE_CHECKLIST.md; scan staged files and verify links/diff.
- [x] Fast-forward local main and push without force; remote main matched 06bd405 after initial publication.
- [x] Complete the [AWS chatbot model correction](../aws-deployment/25-chatbot-model-retirement-2026-11-06.md) requested during release.
- Remote verification evidence is maintained in [GitHub Actions](https://github.com/dhaanish597/OncoBrief/actions), independently of this dated plan.

## Review focus

- Add/add conflicts must not replace authenticated portal routes with older unauthenticated versions.
- Never migrate/reset the pre-existing database listening on port 5432.
- No generated dist-ios/native/build caches, raw recordings, secrets or private evaluator credentials in Git.
- Historical deployment/test claims must not be presented as fresh release evidence.
- All branches must be checked for ancestry after integration; preserve the other worktree.

## Recovery and evidence

Recovery: /Users/dhaanish/.oncobrief_backups/release-20261106/ (workspace archive and all-branches bundle).
Verification logs: /tmp/oncobrief-release-20261106/; publish concise results, not environment dumps.
