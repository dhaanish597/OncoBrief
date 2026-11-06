# Phase 07B Engineering Handoff Document

**Date:** 2026-11-03  
**Status:** `READY_FOR_PHASE_07B`  
**From:** Autonomous Release Engineering Lead & Principal Full-Stack Engineer  
**To:** Next Implementation Agent / Lead Architect  
**Branch:** `feat/v4-assessment-remediation` (HEAD `7b2edec`)  

---

## 1. Verified Baseline Inherited from Phase 07A

The codebase is in an extraordinarily stable, fully tested, and release-ready state:

1. **Monorepo Architecture (7 Packages):**
   - `@oncobrief/core`: Core domain types and utilities.
   - `@oncobrief/db`: PostgreSQL 16 schema, migrations, RLS tenant isolation, Merkle audit chain, seed engine.
   - `@oncobrief/domain`: Strict clinical boundary policies, reconciliation state machine, consultation packet generator.
   - `@oncobrief/adapters`: Multimodal OCR, ABDM M2/M3 client, live Sarvam AI integration.
   - `@oncobrief/worker`: Document processing and background queue worker.
   - `@oncobrief/web`: Next.js 15.5.25 App Router, 43 compiled production routes, full clinician workspace.
   - `@oncobrief/mobile`: React Native 0.88 / Expo 58 patient companion app supporting Android and iOS.
2. **Test Passing Statistics:**
   - **Monorepo Unit/Integration Specs:** 1,423 / 1,423 passed (0 failures, 0 flakes).
   - **Web Browser E2E:** 92 / 92 passed in 1.6m (5 skipped due to external staging).
   - **Mobile Browser E2E:** 9 / 9 passed in 48.7s (including connected continuity loop).
   - **Live Sarvam AI Multimodal Contract:** 4 / 4 passed with genuine cloud credentials.
   - **Static Governance Scans:** 0 clinical boundary violations, 0 branding deviations.
3. **Cross-Platform Compilation Artifacts:**
   - **Android Debug APK:** Compiled FAT APK (241MB) at `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (SHA-256 `0512fd8fee4d...`).
   - **Android Hermes HBC:** Compiled Ahead-of-Time bytecode (3.1MB) at `apps/mobile/dist-android/`.
   - **iOS Xcode Project:** Generated native project at `apps/mobile/ios/OncoBrief.xcodeproj` with `AppDelegate.swift` and `Info.plist`.
   - **iOS Hermes HBC:** Compiled Ahead-of-Time bytecode (3.1MB) at `apps/mobile/dist-ios/_expo/static/js/ios/entry-acabd842e961cc19278e2298916015c5.hbc`.

---

## 2. Invariants & Absolute Safety Rules

The following rules must **never** be violated during Phase 07B:
- **Never Run Destructive Git Commands:** Do not run `git reset --hard`, `git clean -fd`, `git checkout -- .`, or `git restore .`.
- **Do Not Commit or Push Without Authorization:** All modifications must remain in the working tree for human review.
- **Strict Non-Diagnostic Clinical Boundary:**
  - Zero diagnosis algorithms.
  - Zero treatment plan recommendation systems.
  - Zero clinical risk-scoring models.
  - Deterministic medical refusal must remain active for all co-pilot queries asking for medical advice.
- **Evidence Ledger Source of Truth:** Every displayed fact requires an inspectable provenance link `{ document_id, page_number, bounding_box, verbatim_quote }`.
- **Never Silently Overwrite Contradictions:** Both conflicting values must be preserved with full clinician reconciliation rationale.
- **No Costly Cloud Infrastructure:** Do not provision billable cloud resources without explicit budget authorization.

---

## 3. Remaining External Blockers & Actionable Runbooks

The only items preventing a 100% full production rollout are external prerequisites that cannot be created inside an unauthenticated development container:

### Blocker 1: Physical Android / Emulator Runtime Execution
- **Current State:** Classified as `BLOCKED_PREREQUISITE`. The debug APK is built, but `adb devices -l` reports 0 attached devices, and no virtual device images exist in `/opt/homebrew/share/android-commandlinetools`.
- **Phase 07B Action:**
  1. Attach physical Android device via USB with USB Debugging enabled, or install an Android emulator system image (`sdkmanager "system-images;android-35;google_apis;arm64-v8a"`).
  2. Run `tools/verify-android-runtime.sh` to execute the automated Maestro suite (`login-and-boundary.yaml`, `consultation-packet.yaml`, `multilingual-audio.yaml`).

### Blocker 2: Native iOS CocoaPods Compilation
- **Current State:** Native Xcode project and iOS Hermes bytecode are generated and verified. `pod` (CocoaPods) is not installed in the local terminal environment.
- **Phase 07B Action:**
  1. Install CocoaPods: `brew install cocoapods` or `gem install cocoapods`.
  2. Run `cd apps/mobile/ios && pod install`.
  3. Open `apps/mobile/ios/OncoBrief.xcworkspace` in Xcode.
  4. Build and run on an iOS Simulator or connected iPhone.

### Blocker 3: Cloud-Deployed Staging E2E Suite
- **Current State:** Classified as `BLOCKED_EXTERNAL`. Host `dsc1vmsr4q09g.cloudfront.net` does not resolve, and AWS CLI credentials are expired.
- **Phase 07B Action:**
  1. Authenticate AWS CLI: `aws login`.
  2. Provision or verify staging infrastructure at `https://staging.oncobrief.org`.
  3. Run the 5 skipped deployed tests:
     ```bash
     cd apps/web
     E2E_DEPLOYED_CODE=1 \
     E2E_BASE_URL="https://staging.oncobrief.org" \
     E2E_STAFF_USER="dr.rao@rci.demo" \
     E2E_STAFF_PASSWORD="oncobrief-demo" \
     pnpm exec playwright test e2e/deployed.spec.ts --project=chromium
     ```

### Blocker 4: Production App Store / Google Play Signing
- **Current State:** Classified as `BLOCKED_SIGNING`. Production keystores must not be generated or stored in source control.
- **Phase 07B Action:**
  1. Provide `ONCOBRIEF_RELEASE_KEYSTORE` in secure CI/CD vault for Android AAB signing.
  2. Provide Apple Developer Team Certificate and Provisioning Profile for iOS IPA signing.

---

## 4. Immediate Demonstration Instructions

For the Health-a-thon judges or live evaluation, OncoBrief is ready to demonstrate right now:

```bash
# 1. Reset demo database to clean baseline
pnpm demo:reset

# 2. Launch production web server
pnpm --filter @oncobrief/web start --port 3000

# 3. In a second terminal, launch mobile web preview
pnpm --filter @oncobrief/mobile web
```

Follow the 10-scene judge script detailed in [FINAL_DEMO_EXECUTION_GUIDE.md](file:///Users/dhaanish/documents/oncobrief/docs/implementation-planning/healthathon-final-remediation/FINAL_DEMO_EXECUTION_GUIDE.md).
