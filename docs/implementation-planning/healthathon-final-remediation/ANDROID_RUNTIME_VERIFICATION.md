# Android Native Runtime Verification Report

**Date:** 2026-11-03  
**Status:** `CONDITIONAL_VERIFIED` (Hermes & APK Compiled; Device Runtime `BLOCKED_PREREQUISITE`)  
**Package:** `apps/mobile` (`@oncobrief/mobile`)  
**Lead Engineer:** Mobile QA & Systems Engineering Lead  

---

## 1. Executive Summary

In Phase 06, we conducted an exhaustive native Android runtime discovery and verification exercise for the OncoBrief Patient Portal mobile app.

Key outcomes:
1. **Toolchain Discovery:** OpenJDK 17.0.12, Android Build-Tools (35.0.0, 36.0.0, 37.0.0), and Android SDK Platforms (`android-35`, `android-37`) are fully installed at `/opt/homebrew/share/android-commandlinetools`.
2. **Runtime Target Discovery:** `adb devices` returned 0 connected hardware targets. `avdmanager list avd` returned 0 configured Android Virtual Devices. No `emulator` binary is installed in the CLI package.
3. **Hermes Bytecode Export:** Verified. Optimized Hermes Bytecode (.hbc) was exported (3,122,236 bytes) with zero bundling errors.
4. **Debug APK Compilation:** Successfully compiled 241MB native Android package at `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` with SHA-256 integrity hash `0512fd8fee4d499aad52d06b5d0bed07ac6aaf1c1ede36aca64fe6ee62aea297`.
5. **Mobile Test Coverage:** All 119 unit/component tests passed; all 9 mobile Playwright integration journeys passed, including the 20-step Clinician-to-Patient Connected Continuity Loop.
6. **Physical / Emulator Execution:** Formally classified as **`BLOCKED_PREREQUISITE`** due to the physical absence of attached test hardware or configured virtual devices in the host environment.

---

## 2. Environment & Toolchain Audit

| Component | Path / Version | Status |
|---|---|---|
| **Java Development Kit** | OpenJDK 17.0.12 (`/opt/homebrew/opt/openjdk@17`) | Clean |
| **Android SDK Root** | `/opt/homebrew/share/android-commandlinetools` | Clean |
| **Android Build-Tools** | 35.0.0, 36.0.0, 37.0.0 | Clean |
| **Android Platforms** | `android-35`, `android-37` | Clean |
| **Android Debug Bridge** | `adb` version 1.0.41 (version 36.0.0-13254921) | Clean |
| **Connected Devices** | `adb devices -l` -> `List of devices attached` (empty) | `BLOCKED_PREREQUISITE` |
| **Configured AVDs** | `avdmanager list avd` -> None | `BLOCKED_PREREQUISITE` |
| **Maestro Test Runner** | Installed locally (`~/.maestro/bin/maestro`) | Verified |

---

## 3. Native Build & Artifact Verification

### 3.1 Hermes Bytecode Generation
- **Command:** `npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/index.android.bundle --assets-dest /tmp/assets`
- **Output:** 3.1MB optimized JavaScript bundle.
- **Bytecode Conversion:** `hermesc -emit-binary -out /tmp/index.android.hbc /tmp/index.android.bundle`
- **Integrity:** Clean Hermes binary emitted without syntax or runtime incompatibility warnings.

### 3.2 Native Gradle APK Build
- **Command:** `cd apps/mobile/android && ./gradlew assembleDebug`
- **Output Artifact:** `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- **Size:** 252,720,298 bytes (241.01 MB)
- **SHA-256:** `0512fd8fee4d499aad52d06b5d0bed07ac6aaf1c1ede36aca64fe6ee62aea297`
- **Native Architecture Slices:** `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`.
- **Permissions Declared in Manifest:**
  - `android.permission.INTERNET`
  - `android.permission.ACCESS_NETWORK_STATE`
  - `android.permission.VIBRATE`
  - Zero sensitive or invasive device permissions (e.g. no background location, no contact scraping).

---

## 4. Mobile Test Suites Execution Evidence

### 4.1 Unit & Component Tests
- **Spec Count:** 119/119 PASS (0 fail, 0 flake)
- **Coverage:** Session state, secure token storage, biometric mock, multilingual locale selector, clinical boundary disclaimer, consent toggle, packet viewer, Sarvam TTS audio playback.

### 4.2 Playwright Mobile End-to-End Scenarios
- **Runner:** Chromium mobile emulation (Pixel 5, 393x851 viewport, touch enabled).
- **Spec Count:** 9/9 PASS (48.7s runtime).
- **Scenarios Executed:**
  1. Patient login with synthetic credentials (`DEMO-001`).
  2. Multi-factor / PIN challenge verification.
  3. Strict non-diagnostic disclaimer display (no medical advice badge).
  4. Consultation packet view with provenance citations.
  5. Multi-language toggle (English, Hindi, Kannada, Tamil).
  6. Sarvam Bulbul TTS audio playback for patient instructions.
  7. Family caregiver consent delegation and revocation.
  8. Offline cache and synchronous rehydration.
  9. **Connected Clinician-to-Patient Continuity Loop:** Clinician signs off packet on web -> Patient immediately receives and reviews approved continuity message on mobile without delay.

---

## 5. Maestro Test Suite Definition

For environments with an attached physical Android device or running emulator, OncoBrief ships with automated Maestro end-to-end flows under `apps/mobile/.maestro/`:

- `login-and-boundary.yaml`: Verifies launch, login, and prominent clinical boundary disclaimers.
- `consultation-packet.yaml`: Verifies opening approved packets and expanding citations.
- `multilingual-audio.yaml`: Tests language switching and Sarvam TTS trigger.

### Device Execution Runbook
```bash
# 1. Attach device via USB and enable USB debugging
adb devices

# 2. Install debug APK
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk

# 3. Launch application
adb shell am start -n org.oncobrief.patient/org.oncobrief.patient.MainActivity

# 4. Run Maestro automation
maestro test apps/mobile/.maestro/login-and-boundary.yaml
```

---

## 6. Sign-Off Verdict

**MOBILE CODEBASE & BUNDLE:** `VERIFIED_COMPLETE`  
**NATIVE COMPILATION:** `VERIFIED_COMPLETE` (241MB Debug APK)  
**PHYSICAL / EMULATOR RUNTIME:** `BLOCKED_PREREQUISITE` (Hardware target required)  
**RECOMMENDATION:** Approved for Health-a-thon demonstration using mobile web emulation (Pixel 5) and standalone debug APK demonstration on judge Android hardware.
