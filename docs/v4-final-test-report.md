# OncoBrief V4 — final independent test report

24 October 2026 (Asia/Kolkata). Tests ran locally against synthetic data. Original working-tree changes were not reset, stashed, committed, pushed, or deployed.

## Baseline and executed verification

The first `pnpm verify` failed at TypeScript: Studio export used `.accessible/.expectedCount/.availableCount` on `Promise<void>`; caregiver tests used nonexistent `syncedCaregiversCount` and `delivery.sent`; Studio actions accessed possibly undefined `ungroundedClaims`. Therefore the previous report's green “820 tests / 32 Playwright” baseline could not be reproduced. No baseline test count is inferred from that failed command. A subsequent exploratory `pnpm test` included regression tests being added concurrently; its counts are not represented as an immutable pre-change baseline. It failed caregiver, Studio source, locale-code, and new RED regressions, as recorded in local logs.

Final checks:

| Command / scope | Actual final result |
|---|---|
| `pnpm verify` | 886 automated tests passed, zero failed/skipped; typecheck, ESLint, clinical-boundary and branding checks passed. |
| `pnpm --filter @oncobrief/web build` | Optimized Next.js 15.5.25 production build passed, including TypeScript and dynamic route generation. |
| `pnpm worker:build` | Passed; index/admin bundles built with all current migrations. |
| PostgreSQL integration/config/security | 183 passed within the automated total. |
| Relevant Chromium browser acceptance | 51 distinct tests passed across 12 files, run serially with isolated reset between mutation suites. |
| `pnpm demo:prepare` | Exit 0, read-only original-database checks; no migrate or seed. Original 25/118/159/147 counts and full hashes remained intact. |
| `pnpm demo:prepare --reseed` | Exit 0 only on explicitly opted-in local synthetic review database. |
| Production-mode reset refusal | Actual local negative command exited 1 with `demo_reset_requires_development`, before resetting. |
| Mixed-database reset refusal | Real PostgreSQL sentinel test refused reset and preserved all patient and sentinel organization rows. |
| Fresh-database `pnpm db:migrate` | All 15 migrations applied from zero; no new migration added by this review. |

### Automated suite counts

| Package | Passed |
|---|---:|
| domain | 415 |
| adapters | 86 |
| db | 183 |
| worker | 29 |
| web | 173 |
| **Total** | **886** |

### Browser acceptance counts

| Specification | Passed |
|---|---:|
| demo-flow | 8 |
| phase2-consultation-readiness | 3 |
| phase3-opd | 6 |
| phase3-ownership | 2 |
| phase4-studio-guidelines | 4 |
| phase5-continuity-voice | 4 |
| assistant | 7 |
| abdm-complete | 1 |
| abdm-flow | 3 |
| abdm-revocation | 1 |
| phase4-ux-accessibility | 10 |
| independent-judge-journey | 2 |
| **Total** | **51** |

These are distinct final test cases, not the sum of retries. This is the relevant acceptance selection, **not** a claim that the whole historical browser inventory passed. Twenty other cases (landing, opt-in deployment, old external-fixture remediation/design-parity suites) were not run. No deployed/cloud acceptance is claimed. Responsive checks exercised 375, 768, 1024 and 1440 pixel widths; selected screenshots were visually inspected. These checks do not establish complete WCAG certification.

## Environment and reproduction

The original `oncobrief` database was queried read-only, then cloned into **oncobrief_codex_review** before mutation tests. Tests used `/tmp/oncobrief-codex-review/storage`; original source storage was not reset. Every shared-DB suite ran serially to avoid fixture races. The production server was restarted after builds.

Set both local database URLs to the review database, `DEMO_DATABASE_NAME=oncobrief_codex_review`, `ONCOBRIEF_DEMO_MODE=true`, and the separate storage path. Use empty Sarvam/NVIDIA keys and `OCR_DRIVER=local-pdf EXTRACTION_DRIVER=rule LLM_PROVIDER=rule ABDM_DRIVER=simulated`. `pnpm verify` uses Vitest's test environment; explicit reseed uses `NODE_ENV=development`. The production browser server used port 3001 and `ABDM_CALLBACK_BASE_URL=http://localhost:3001`.

For each browser row above: run the guarded synthetic reseed, then execute:

```sh
E2E_BASE_URL=http://localhost:3001 E2E_SKIP_SERVER=true \
pnpm --filter @oncobrief/web exec playwright test e2e/<specification>.spec.ts
```

Do not reseed between scenes inside the independent ordered journey. Its second test exercises HTTP withdrawal/security immediately after the complete journey.

The demo environment’s documented passwords are isolated development fixtures, never acceptable production credentials. The original configuration had a Sarvam key present; provider settings were deliberately overridden for deterministic local acceptance without exposing credential values or calling the provider.

## Database and migration evidence

Original PostgreSQL 16.15 / 5432 / `oncobrief`, restricted runtime login `oncobrief_app` (not superuser/BYPASSRLS), two synthetic tenants/four marked synthetic patients. Disk migration list exactly matched 15 applied IDs. Catalog: 51 RLS-enabled/42 forced-RLS tables; privileged bootstrap/ABDM exceptions are documented in the independent review. Missing tenant context returned zero rows, and cross-tenant access/write and append-only tests passed.

Original 159 ledger and 147 audit hashes were independently recomputed from full persisted row material, including genesis/pointers/sequence. Both passed; original counts and chains remained unchanged after the review. The ordinary UI badge only verifies ledger linkage, so it is not used as proof of full-material integrity. A separate empty database `oncobrief_codex_migration_review` exercised all migrations from zero.

Original inventory differed from the prior report's per-patient distribution: primary DEMO-001 had 11 documents including a pre-existing synthetic `test.pdf`, DEMO-002 five, DEMO-003 nine, secondary patient zero. Original patients 1/2 were blocked with two conflicts each. A fresh seed has 24 documents; numbers change through legitimate imports. Synthetic flags and recognized fixture content were inspected; this is not a guarantee about all possible arbitrary uploaded content.

## Actual failures, fixes and test changes

1. Baseline compile errors and mismatched locale-test expectation: corrected actual contract usage; no tests claimed before execution.
2. Studio missing-source guard/empty-citation FHIR/legacy-content/title/patient-ID/timeline-position vulnerabilities: failing domain/action/route/service probes, then strict exact-source/template validation and canonical frozen approval checks. Extra numbers, altered units, misleading/removed citations, uncited statements, clinical directives and unsupported titles are rejected.
3. Frozen source leakage and alternate HIP transfer: real RED returned full packet/transferred bytes after revocation. GREEN masks content and refuses transfer; every HTTP export format returns 409 under real app-role RLS.
4. Source-bound continuity: invented form text, wrong patient/packet and persisted body tampering reproduced. Server resolves values from the actual same-patient source and rechecks approval/dispatch/TTS.
5. Redaction: nested arrays and raw exceptions reproduced. Recursive redaction fixed them; the existing import/revocation retry test then exposed loss of cleanup object keys. Named opaque retry-key entries fix that regression without restoring patient content.
6. Unchecked reminder opt-out: now saves false. Caregiver send tests observe real adapter recipient calls and revocation suppression, rather than a nonexistent `sent` array.
7. Reset/preparation safety: tests reproduce unsafe behavior, then enforce read-only preparation and centralized environment/identity/transaction guards. Missing fixtures do not trigger an automatic seed.
8. Audit history: source/slot association survives withdrawal/release through immutable ledger/slot-event references.
9. Actual browser source-navigation defect: lab/medication links now identify document, fact and page.
10. Historical browser assertions were not reliable: silent batch skip, state badge looked for in the wrong view, broad text selectors racing navigation, variable conflict membership, unverified-patient citation expectation, a fixed Day 0 assumption, unsupported free-form Studio note approval, and a stale ABDM heading. Corrected assertions require real actions/current source state; negative safety tests retain strict unsupported-text rejection. ABDM simulator failure was also reproduced with an incorrect callback port and corrected through explicit test-server configuration.

No failing test was waived to claim green. Initial failure logs are retained alongside final evidence. Existing whole-tree `git diff --check` warnings about trailing blank lines in `.env.example`, `documents.ts`, `patients.ts`, and `ports/index.ts` predated this review; unrelated files were not reformatted to hide them.

## Changed files attributable to this review

This is distinct from the much larger pre-existing uncommitted V4 diff.

- Domain: `packages/domain/src/studio/draft-generator.ts`; `test/studio-safety-audit.test.ts`.
- Database: `src/services/{studio,packets,abdm-hip,abdm-hiu,messages,audit,patients}.ts`; `src/{seed,run-demo-reset,demo-readiness}.ts`. Tests added/updated for Studio guards, canonical hashes, withdrawal, patient audit history, continuity grounding, caregiver dispatch, nested redaction, and reset/readiness safety. `demo-readiness.ts` is new; no SQL migration changed.
- Web: `src/lib/{actions,studio-validation,scoped-tts}.ts`; Studio/assistant/continuity TTS routes and callers; `ProductivityStudio`, `ContinuityAudioPlayer`, lab/medication source links, and continuity page props. New action/export/TTS security tests plus strengthened security regression tests.
- Worker: `src/{logger,index}.ts`, `test/logger.test.ts` for nested/error privacy.
- Tools: `tools/prepare-demo.{ts,mjs}` use one guarded implementation.
- Browser: new ordered journey/security spec; focused corrections in phase2, phase4 Studio, UX and ABDM flow specs.
- Documents: three requested new reports, corrected three judge materials, and explicit supersession notices on the three historical audit reports. Synthetic SOP attribution in the seed was clarified.

## Evidence and limitations

Final command logs, read-only database material verification, initial RED logs, browser suite results and execution helpers were recorded under `/tmp/oncobrief-codex-review/`; retained key logs accompany these reports under `review-evidence/2026-10-24/`. These contain synthetic examples, no credential values. See the independent review for clinical/security boundaries and the demo report for role switches/recovery.

Measured candidate discovery in the final automated run was **9.49 ms for one eligible synthetic candidate** (0.88 ms for the separate occupied-slot fast path), not a hospital benchmark or capacity/outcome result. Browser speech had zero installed voices. Cloud OCR/TTS/LLMs, external ABDM/carriers, full FHIR conformance, narrated timing, real-patient use and institutional authorization remain unverified.
