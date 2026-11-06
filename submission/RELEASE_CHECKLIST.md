# Repository release checklist — November 6, 2026

Scope: organize and preserve the repository, integrate outstanding patient-mobile work and publish the verified source to GitHub `main`. This is a synthetic prototype source release, not a deployment, clinical clearance or event-portal submission.

## Integration and preservation

- Original checkout base: `7b2edec145a9efe88f7f3928e6de975743ce33ca` on `feat/v4-assessment-remediation`.
- Preserved eligible working files and all branch history outside Git at `/Users/dhaanish/.oncobrief_backups/release-20261106/` before integration.
- Preserved existing work in commits `6cb4a68` (shared foundation), `a85f12d` (platform) and `e7d50ad` (documentation); the merge commit `62f8c47` integrates `oncobrief-patient-app` at `b363f3b` with its full development history.
- Conflict resolutions retain newer local iOS export, upload/readiness/FHIR exports and mobile test fixes; import the patient branch's CI gate and two dated implementation plans.
- `git branch -a --no-merged HEAD` returned no branches: the clinical UI branch, patient branch and existing local branches are all ancestors of the integrated source. No branch or other worktree was deleted.
- Added documentation indexes, grouped research under `docs/research`, historical root plans under `docs/archive`, and editable slide assets under `submission/presentation-assets`. Existing decks/templates are preserved; moved root assets have SHA-256 records in `ASSET_MANIFEST.json`.

## Release fixes

- Corrected README's obsolete deployment URL and current app/setup map; clone main includes the mobile app.
- CI explicitly migrates before seeding, uses Node 24 and the lockfile, and generates Android native source before packaging. SDK setup no longer requests the removed legacy `tools` package.
- Cleared repository lint failures with precise types, unused-code cleanup and correct CommonJS/extension environments. Generated native/render output is excluded, without disabling application safety rules.
- Encryption randomness uses native Expo CSPRNG or WebCrypto and fails closed if unavailable. Regression tests observed the insecure fallback failure before repair.
- Snapshot/mobile views preserve real ledger review state and actual source quote, page/span, document version and extraction/reviewer metadata. Unavailable metadata remains unknown; the app no longer invents PDF type, file size, token, clinician, upload date or confirmed evidence status.
- Independent review found an appointments-only caregiver could receive timeline/provenance. The regression first failed, then the service was gated by document scope and all 20 portal negative-security tests passed.
- Preparation saves now persist with patient/caregiver audit metadata, fail atomically on audit failure, and retain approved offline changes until retry succeeds; queue identity guards prevent replay into another patient.
- Chatbot model retirement was reproduced: NVIDIA returned HTTP 410 for the old default. Replacement `nvidia/nemotron-3.5-bolt-e4b` returned HTTP 200 on a synthetic probe; source defaults/runtime configuration and cited deterministic failure recovery are updated. AWS web task revision 4 now explicitly selects the replacement; live missing-document/source answers and clinical refusal passed through the gated UI.
- Android network policy is generated from a checked-in Expo plugin; no broad cleartext traffic is allowed. Native build checks, browser previews and device verification remain distinct.

## Verification environment

Node 24.21.0, pnpm 9.15.4, PostgreSQL 16 on a newly initialized loopback-only cluster at port 55432. Existing PostgreSQL on port 5432 was not reset or migrated. The clinician browser suite used localhost:3001 with matching ABDM simulated callback URL; mobile browser checks use separate ports/database. Local fixtures and storage are disposable. Optional provider keys were cleared for reproducible offline checks; outbound delivery and ABDM remained simulated.

Verification logs are local under `/tmp/oncobrief-release-20261106/`; they are not required to build the repository. Tests that modify data ran only against disposable fixture databases. The mobile E2E setup now refuses absent/nonlocal/shared database configuration and requires an explicit test database.

| Check | Result |
|---|---|
| Frozen-lockfile installation | Passed |
| Workspace typecheck | Passed across all packages |
| ESLint, clinical boundary and branding | Passed |
| Full workspace unit/integration suite | Passed: 1,503 tests (mobile 135, domain 599, adapters 137, database 277, worker 29, web 326); four opt-in provider tests skipped |
| Portal negative security regression | 20/20 passed, including document-scope denial |
| Web production build | Passed |
| Worker bundles | Passed |
| Mobile web / iOS / Android bundle exports | Passed; installable APK build recorded separately |
| Clinician browser suite | Passed: 102 Chromium tests; nine deployment-only opt-in tests skipped |
| Mobile browser suite | Passed: all nine browser workflows, including a connected save/retry verified in PostgreSQL |
| Android installable debug APK | Passed: Gradle assembleDebug, package org.oncobrief.patient; not a standalone release or device-runtime check |
| Native physical-device runtime | Not rerun for this release |
| Terraform format + dev/hackathon validation | Passed; hackathon validation retains a provider deprecation warning |
| Candidate credential patterns / oversized Git objects | No findings; no candidate file above 50 MiB |
| Branch ancestry / asset move checksums | Passed |
| GitHub main / workflow results | Published to main; [latest checks](https://github.com/dhaanish597/OncoBrief/actions) record remote verification independently of these local results |

## Artifact and submission boundaries

- [Submission links](LINKS.md) accompany the existing presentation and PDF. Existing decks are preserved as supplied, with dated validation figures and blank MVP/video fields; do not upload them as a newly reviewed next-round presentation without checking the portal's requirements and inserting the supplied links.
- The 30-minute tutorial is 107,146,343 bytes, too large for a normal GitHub Git blob. It is distributed as a release asset with checksums in `RELEASE_ASSETS.json`; transcript, chapters and subtitles are included under `submission/tutorial`. Historical short walkthroughs are versioned in `reports/visual-proof`.
- No secrets, `.env`, evaluator credentials, live database data, Terraform state, signing keys, APK/build caches or raw recordings are included in Git. Debug APKs belong in workflow/release assets. This release's debug APK requires Metro for JavaScript; it is not a standalone production app.
- The November 5 restricted deployment has a separate source manifest and may predate this source release. The user subsequently requested a deployed-chatbot fix: a reviewed ECS model-setting update was applied and verified. No database reset, infrastructure shutdown or application-image redeployment occurred.
- Four external-provider contract tests are opt-in. A local deterministic pass is not live Sarvam/NVIDIA, ABDM, EHR integration or actual patient-message verification.
- No real-patient pilot, independent clinical efficacy evaluation, compliance certification or full new-device accessibility review is established here.
