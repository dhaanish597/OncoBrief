# OncoBrief patient companion

Expo / React Native app in the main OncoBrief monorepo. Clone **main**, not a separate mobile branch. This administrative companion preserves source evidence and keeps patient review distinct from clinician verification. Synthetic demonstration only; not approved for real patient records.

## Setup and run

Use Node 24 LTS (24.3+), pnpm 9.15.4 and the repository lockfile:

```bash
pnpm install --frozen-lockfile
pnpm --filter @oncobrief/mobile start
# Static browser preview on http://127.0.0.1:8086:
pnpm --filter @oncobrief/mobile export:web
pnpm --filter @oncobrief/mobile preview
```

Use a compatible Expo SDK 58 Android development environment. The offline demo uses explicitly fictional oncology records and requires no backend, account or provider key. Connected Hospital Mode uses the authenticated patient-portal APIs and must be configured against the hospital backend with a valid patient/caregiver session. The synthetic OTP mechanism is rejected in production; no real OTP delivery provider is claimed.

## Included workflows

- English/Tamil onboarding and navigation; synthetic oncology cohorts.
- Records vault, document import consent, source inspection, patient review and discrepancy flags.
- Evidence journey, source-linked laboratory observations and personal wellbeing notes.
- Consultation preparation, configurable checks, questions, notes and approval-bound packet export.
- Connected appointment attendance, approved-message feed, coordinator requests and scoped voice playback.
- Caregiver consent, scoped/revocable sharing, local activity history, privacy shield and erase flow.

Offline imports never create verified medical facts. Patient acknowledgements never confer clinician verification. Source contradictions remain visible for human reconciliation. Real external sharing, message delivery and clinical interpretation are not implied by local simulation controls.

## Verify

```bash
pnpm --filter @oncobrief/mobile typecheck
pnpm --filter @oncobrief/mobile lint
pnpm --filter @oncobrief/mobile test
pnpm --filter @oncobrief/mobile export:web
pnpm --filter @oncobrief/mobile export:android
pnpm --filter @oncobrief/mobile export:ios
```

`pnpm verify:patient-mobile` also checks the backend portal and database/RLS tests: provision a dedicated local migrated/seeded PostgreSQL database first (see [root setup](../../README.md)). Browser E2E requires a web export, installed Playwright Chromium, the dedicated database, and free ports 8087 and 3000. Its local portal test server is a test harness, not proof of a production hospital deployment.

```bash
pnpm --filter @oncobrief/mobile exec playwright install chromium
pnpm --filter @oncobrief/mobile test:e2e
```

The generated native-manifest assertion explicitly skips if `android/` has not been generated; app.json privacy checks always run. That skip does not establish native build or runtime success.

## Installable Android build

Application ID: `org.oncobrief.patient`. Configure JDK 17 and the Android SDK/NDK needed by the generated Expo project; set `JAVA_HOME` and `ANDROID_HOME`.

```bash
pnpm --filter @oncobrief/mobile exec expo prebuild --platform android --no-install
bash tools/verify-android-build.sh
# Optional device/emulator runtime verification:
bash tools/verify-android-runtime.sh
```

For USB development, forward the local services with `adb reverse tcp:8081 tcp:8081` and `adb reverse tcp:3000 tcp:3000` (also performed by the runtime verification script). Set `EXPO_PUBLIC_API_BASE_URL` before export if using a different approved backend.

Expected debug artifact after a successful Gradle build: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. The [GitHub workflow](../../.github/workflows/android-apk.yml) generates the native project before building and uploads the APK as a workflow artifact. A debug APK may use Metro; follow the workflow/build evidence for its exact packaging. Hermes `.hbc` export alone cannot be installed on Android. iOS bundle export does not establish an iOS signed app or device verification. EAS cloud builds require an owner-configured project/account and are separate from local verification.

## Architecture and security assumptions

- `domain.ts`: typed ledger views, deterministic state transitions and audit chain. `repository.ts`: offline/connected repositories and sync handling. `api-client.ts`: authenticated portal client.
- Native local state uses AES-256-GCM and a SecureStore key; keys and IVs use Expo `getRandomValues`. Web/Node require WebCrypto and fail closed without a secure random source. No weak random fallback is permitted.
- Web demo persistence stores its encryption key in the same browser profile as encrypted state. This does not protect against XSS or a compromised browser/profile. Native document copies remain under OS app isolation; metadata encryption is not a claim of encryption for every imported file.
- Android backup is disabled; camera consent and permissions are explicit. Microphone, contacts and broad media/storage permissions are blocked. Background privacy controls and audit hashes do not substitute for an external security review.
- Real use requires reviewed identity verification/OTP delivery, authorization, server audit, retention, device security, encryption, consent and revocable access. No clinical efficacy, real-patient pilot or compliance certification is claimed.

See [ADR 0026](../../docs/decisions/0026-patient-mobile-architecture.md), [mobile planning index](../../docs/plans/README.md) and [current release checklist](../../submission/RELEASE_CHECKLIST.md). Older milestone reports preserve their original dates; use the release checklist for fresh verification and native-device limitations.
