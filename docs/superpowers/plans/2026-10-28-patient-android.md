# Patient Android Implementation Plan

**Goal:** An independent, polished patient companion with complete local demo workflows.
**Architecture:** Evidence-ledger projection, typed reducer, persistent local demo adapter, fail-closed production gateway. Expo Router handles native navigation. Localized UI and original vector artwork.
**Tech stack:** Expo version verified from registry, React Native, TypeScript, SVG, Expo file/document/image APIs, Vitest, Playwright browser preview checks.
**Spec:** User attachment, AGENTS.md, CLAUDE.md and ADR 0017.

## Constraints

- Preserve all existing work; add only apps/mobile and mobile-specific documentation/configuration.
- Synthetic data only; no existing mobile backend calls or external AI.
- Distinguish extraction, patient review, clinician verification and conflicts.
- No clinical recommendations, risk scores, inferred requirements or silent sharing.
- English and Tamil; accessible data alternatives; reduced motion.

## Tasks

- [x] 1. Configure isolated mobile package and write failing domain tests: validation, search/category, timeline projection/filtering, patient review, checklist, consent scope/expiry/revocation, export approval, persistence and production rejection.
- [x] 2. Implement typed model, synthetic fixture, pure reducer/selectors, persistence adapter and tests until green.
- [x] 3. Implement shared theme, localized strings, illustrations, landing/onboarding, five tab routes and functional patient workflows.
- [x] 4. Add file selection/camera with consent, validation and preview; packet preview/export, simulated sharing, audit and offline handling.
- [x] 5. Run typecheck, lint, tests, Expo dependency validation, Android JS export/prebuild and browser interaction checks. Inspect narrow viewport and Tamil. Document exact outcomes and build limitations.

## Review focus

Tampered persisted state must fail closed; missing provenance cannot create timeline facts; patient review must never elevate clinician state; sharing must reject stale/unknown scopes; changes must survive back navigation and restart. Validate these in tests and final review.

## Execution decisions

The user explicitly requested autonomous execution without design questions. Implement inline in a new directory; do not commit or move the user's dirty checkout. No native SDK is yet found. Generate APK only if supported; report build status honestly.

## Verification ledger

- Domain tests: initial missing-module RED, implemented GREEN; 21 tests passed including independent-review regressions.
- Independent review found forged fixture hydration, incomplete nested validation, asynchronous note restoration and unsafe overwrite after a failed read. Added regression tests and fixed all four; write retries, strict immutable fixtures and centralized drafts are covered.
- Lab chart now projects structured observations from the ledger. Patient corrections cannot author or clinically verify ledger facts.
- Browser tests: 10/10 passed in headless Edge at 393×852 and 360×800. Actual image selection/import, source inspection, export download, sharing/revocation, navigation and Tamil tested. English/Tamil screenshots captured outside source.
- Broader repository suite ran: domain 307, adapters 24, worker 26, web 113 and DB unit 15 passed. Four DB integration suites (`chat`, `companion`, `ledger`, `security`) could not connect to local PostgreSQL at 127.0.0.1:5433; sandbox retry outside sandbox confirmed ECONNREFUSED.
- Final recheck after Expo online version alignment: React Native 0.88.0, TypeScript 6.0.3-compatible range, matching Metro configuration. Online dependency validation, typecheck, lint, all 21 mobile tests, all 10 browser tests, web export, Android Hermes export and native project generation succeeded. The native template recommends RN 0.88.1 while the online compatibility map requires 0.88.0; the app follows the online map and passes both bundle exports.
- Android bundle: `apps/mobile/dist-android/_expo/static/js/android/entry-91820771a86bb77f91bb5350c88e3bff.hbc`, 2,888,142 bytes. This is not an APK. No usable Android SDK, adb, emulator or local.properties was found; no APK or device run is claimed.
- Ruling: production integration stays disabled because the existing patient identity routes are not authorized securely. Cost: real patient deployment requires the separate backend security work described in ADR 0017.
- Ruling: no commit, merge, push or cloud build is performed in the existing dirty checkout. New files and the updated workspace lockfile remain reviewable in place.
