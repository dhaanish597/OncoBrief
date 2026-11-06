# OncoBrief patient Android companion

Independent React Native / Expo application. The clinician website is not reused or rewritten. All patient data and clinician labels are explicitly synthetic. This package never calls the existing patient/mobile HTTP routes.

## Run

This branch includes the full patient application under `apps/mobile` and retains the existing website. Run the commands from the cloned repository root. The patient demo needs no database, backend service, environment file, API key or credentials. No mobile `.env.example` is needed; the existing root example belongs to the website/backend.


Use Node 24 LTS (React Native 0.88 requires `^22.13.0 || ^24.3.0 || >=26.0.0`), pnpm 9.15.x, and the root lockfile.

```powershell
git clone --branch oncobrief-patient-app https://github.com/dhaanish597/OncoBrief.git
cd OncoBrief
pnpm install --frozen-lockfile
pnpm --filter @oncobrief/mobile start
```

Use an Expo SDK 58 compatible Android client or a development build. To inspect the same native UI in a browser:

```powershell
pnpm --filter @oncobrief/mobile web
# Or export and serve a static preview at http://127.0.0.1:8086:
pnpm --filter @oncobrief/mobile export:web
pnpm --filter @oncobrief/mobile preview
```

The browser preview keeps state for the current session only. Android stores demo state and selected sample copies in its private app directory. There is no network dependency, upload, OCR, AI request, EHR integration, push service or real sharing.

## Verification

```powershell
pnpm --filter @oncobrief/mobile typecheck
pnpm --filter @oncobrief/mobile lint
pnpm --filter @oncobrief/mobile test
pnpm --filter @oncobrief/mobile exec expo install --check
pnpm --filter @oncobrief/mobile export:web
pnpm --filter @oncobrief/mobile test:e2e
pnpm --filter @oncobrief/mobile export:android
```

Browser tests use installed Microsoft Edge, launch a local preview server on 127.0.0.1:8087, and exercise the exported native web build. The Browser plugin was not available in this session. Screenshots can be captured outside source by setting `ONCOBRIEF_SCREENSHOTS` before `test:e2e`. Android camera, file intents, physical back, TalkBack, large native fonts and process-death persistence still require an Android device/emulator.

## Build an installable Android app

Application ID: `org.oncobrief.patient`; display name: OncoBrief. The original vector icon is in `assets/icon.svg`; its generated PNG is included. Camera permission is requested only after sample-file consent. Microphone, contacts and broad storage/media permissions are blocked. Android backup is disabled.

Install Android Studio's SDK/NDK components required by the generated Gradle project, platform-tools, an emulator or USB device, a supported JDK (Android Studio's bundled runtime), and set `ANDROID_HOME` and `JAVA_HOME`. The verified installed React Native template specifies compile SDK 37, build-tools 37.0.0, NDK 27.1.12297006, minimum Android API 24 and target API 36; Gradle wrapper is 9.4.1. Recheck these values if upgrading dependencies.

```powershell
cd apps/mobile
pnpm exec expo prebuild --platform android --no-install
pnpm android
# Local distributable debug APK, with Android tooling configured:
cd android
.\gradlew.bat assembleDebug
# Expected only after a successful Gradle run:
# app\build\outputs\apk\debug\app-debug.apk
```

The `android/` project is generated and ignored; app.json is the configuration source. For a cloud preview APK, use an authenticated Expo account, install EAS CLI, and run `eas build --platform android --profile preview` from apps/mobile. This uploads source to Expo and may incur build usage; no cloud build was submitted by this implementation. Configure the EAS project association with your own account first. `eas.json` selects APK output. Never treat Hermes bytecode export as an APK.

## Workflows and boundaries

| Workflow | Behavior |
|---|---|
| Landing/onboarding | Original vector care illustration, language selector, honest unavailable sign-in explanation |
| Home | Source conflict as next step, actual document count, personal preparation indicator, source-linked approved-message fixture |
| Records | Search, category filter, sort, original inspection, distinct extraction/patient/clinician labels |
| Import | Explicit fictional-file consent, picker/camera, 25 MB limit, extension/MIME/magic-byte validation, local copy, progress and retry |
| Report review | Exact source text/page/version/method/reviewer; patient review never confers clinician verification; flags become discussion items |
| Journey | Ledger projection, event/date filters, expandable provenance and separate personal notes |
| Insights | Selectable category map, preparation ring/checklist, source-linked lab points plus accessible data, optional patient observations, appointment calendar and chronological sources |
| Labs | Only bundled structured ledger observations, exact source quote, supplied unit/reference interval, separate review status; no interpretation |
| Preparation | Configurable checklist, questions/discussion state, notes, selected documents, persisted drafts |
| Missing records | Patient-created items, requested/available/unavailable states, notes and existing-document attachment |
| Comparison | Both original wordings and dates; contradictions remain visible and unresolved |
| Pack | Exact preview, explicit approval bound to current pack content, text export/download or device share sheet; original files not attached |
| Sharing | Exact recipient/purpose/scope/permissions/expiry preview, explicit simulation approval, expiry/revocation/history; no recipient is contacted |
| Privacy | Storage explanation, reduced motion, English/Tamil, leave and explicit erase-confirmation flows, local activity trail |

Source documents retain their original language. UI vocabulary and principal workflows are localized centrally in `src/i18n.ts`; Tamil packs localize framing while preserving original quotations and patient-authored text. The glossary defines the administrative word “report” only. Clinical terminology and urgent-symptom decision flows need reviewed content and are intentionally unsupported. No AI service is configured.

## Architecture and security

`domain.ts`: typed records, evidence ledger, pure audited state transitions, selectors, consent guards, packet builder, strict persisted-state validation. No mobile operation can create or clinically verify evidence. Canonical fixtures and immutable metadata are checked on hydration; imports never become structured medical facts. `repository.ts` serializes writes, blocks writes after failed reads, and supports explicit retry/reset. `storage.ts` isolates native files beneath `oncobrief-demo/`; web persistence is disabled. Shared drafts prevent back navigation from losing form text. React UI has no database or server import.

This is a synthetic demonstration, **not approved for real patient records**. The local demo directory lacks application-level encryption; its activity trail is not a cryptographically anchored audit. OS app isolation and disabled Android backup do not substitute for a production security review. Imported files are copied, never sent externally. No tokens, patient credentials, analytics or health-data logging exist in this package. Erasing the workspace removes its saved state and retained sample copies; source files outside the app are untouched. Picker/camera caches remain subject to OS cache cleanup.

Production is intentionally fail-closed (`productionGateway.load()` throws). The backend connection requires server-side authenticated patient identity, verified patient/document ownership, least privilege, read-only ledger projections, audit persistence, private encryption, short-lived document authorization, revocable sharing, retention policy, consent and reviewed safety content. Do not use an `x-patient-id` header or raw patient-id cookie as authentication. The existing uncommitted mobile endpoints require a separate security fix before use.

See `docs/decisions/0017-independent-patient-android.md` and the implementation plan for the architectural decision. Existing clinician demo and APIs are preserved.

## Patient design upgrade — 30 October 2026

The existing Expo patient app now follows the approved cool white/blue reference. New routes are `/labs`, `/lab/[test]` and `/wellbeing`. Home, guided consultation preparation, journey and shared components were upgraded in place; original records, imports, consent, review, sharing simulation, packet export, privacy and English/Tamil remain available.

Main implementation: `src/connected-home.tsx`, `src/laboratory.tsx`, `src/history-chart.tsx`, `src/preparation-workspace.tsx`, `src/wellbeing-workspace.tsx`, `src/journey.tsx`, `src/patient-selectors.ts`, `src/ui-core.tsx`, `src/icons.tsx`, `src/theme.ts`, `src/patient-copy.ts` and their route facades. The domain adds audited question editing/removal without changing canonical evidence. Tests are in `test/upgrade.test.ts` and `e2e/upgrade.spec.ts` alongside preserved workflow tests.

Laboratory graphs support line/columns, selected observations, 1M/3M/6M/1Y/All windows, reference shading, numeric range indicators, arithmetic comparisons and source inspection. Only the two existing source-backed haemoglobin observations are available. Missing laboratory tests, treatment schedules and medication adherence are not populated from reference images. Wellbeing charts show individual patient-reported entries without medical interpretation; local calendar dates are consistent across display and filters. Preparation has four stages, configurable checks, question editing and confirmed deletion, draft-preserving notes and existing approval-bound packet export.

No live API was connected. Backend inspection still found patient-id header/cookie identity and demo fallback, so the isolated synthetic gateway remains; production loading fails closed. Existing privacy/security limitations above continue to apply. General haemoglobin terminology links to the official MedlinePlus haemoglobin-test glossary; it does not interpret patient results.

Verification: mobile TypeScript, lint, all 30 unit tests, web export, Android prebuild and Android Hermes export passed. All 15 browser workflows passed; the suite exercises the app using installed Edge because no Browser plugin was available. Tests now use port **8087**; the normal preview uses **8086**. Final browser outcomes are recorded in the implementation checklist. Android SDK/adb/emulator are unavailable, so no installable APK or native-device verification is claimed. Database integration tests still fail with ECONNREFUSED at 127.0.0.1:5433 on an outside-sandbox retry; 15 database unit tests pass. Clinical-boundary and branding scans are clean.

Run from the workspace with supported Node 24 on PATH:

```powershell
pnpm --filter @oncobrief/mobile export:web
pnpm --filter @oncobrief/mobile preview
# http://127.0.0.1:8086
pnpm --filter @oncobrief/mobile start
# Scan with a matching Expo development environment, or use the Android build instructions above.
pnpm --filter @oncobrief/mobile test:e2e
```

Historical visual evidence was captured locally during design verification; those developer-machine screenshots are not required or included in the source distribution. Both the approved concept and rendered screens were inspected with view_image. Phone screenshots are 393×852 (Tamil also tested at 360px); the concept is a three-phone presentation rather than a native application viewport.

Fidelity comparison: retained cool background/white panels/cobalt actions; navy sans hierarchy; fine borders and rounded containers; consistent original outline icons; matching pale-blue consultation illustration; source-value chart with shaded reference band; home appointment/lab/preparation order. Dense initial cards and checklist wording were simplified after screenshot review. Intentional deviations: actual fixture dates/source names replace invented concept text, source status remains visible, accessible touch targets produce more vertical scrolling, line/column controls and history-window labels support the requested graphs, and preparation uses explicit stages rather than fitting every form into one screen. Above-fold copy changes are these source/safety/interaction differences; primary approved home and preparation headings are retained. No clipping or horizontal overflow was observed in English/Tamil checks.

The production illustration is `assets/consultation.png`, generated with the built-in imagegen tool as a wide, text-free pale-blue patient/doctor consultation banner, then copied into the repository. It is packaged locally, with no runtime image service.

## Verified handoff — 28 October 2026

- TypeScript, lint (including browser tests), 21 mobile domain/repository tests and 10 Playwright workflow tests passed.
- Final online Expo compatibility check passed. The online map selects RN 0.88.0 and TypeScript ~6.0.3; the native template currently suggests RN 0.88.1. This app follows the online map and pins matching Metro configuration.
- Web export, Android native project generation and Android Hermes bytecode export passed. The final Android `.hbc` file is 2,888,142 bytes; **it cannot be installed as an APK**.
- English and Tamil screenshots inspected at phone sizes. Browser coverage includes source review, actual sample image import, consultation-pack download, consent/revocation, reset and all five tabs.
- No Android SDK, adb or emulator was available, so native execution, camera/intent behavior, TalkBack, native font scaling, process-death persistence and installable APK compilation remain unverified. No APK was produced. The build commands above are provided for a configured environment.
- Full existing workspace tests also ran: 307 domain, 24 adapter, 26 worker, 113 web and 15 DB unit tests passed. Four integration suites (`chat.test.ts`, `companion.test.ts`, `ledger.test.ts`, `security.test.ts`) remained blocked by PostgreSQL connection refusal at 127.0.0.1:5433, confirmed on a retry outside the sandbox.
- Existing web/backend changes were left intact. Work remains uncommitted; no push, merge, deployment or cloud build occurred.
