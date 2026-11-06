#!/usr/bin/env bash
set -euo pipefail

# OncoBrief Mobile - MOB-023 Native Android Physical Device Runtime Verification Script
# Strict non-diagnostic clinical boundary: Verifies authentic client execution,
# bilingual localized UI, encrypted persistence, and live backend connectivity on physical Android hardware.

echo "========================================================"
echo "  ONCOBRIEF MOB-023: NATIVE ANDROID RUNTIME VERIFICATION"
echo "========================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MOBILE_DIR="${REPO_ROOT}/apps/mobile"

echo "Repo root:   ${REPO_ROOT}"
echo "Mobile dir:  ${MOBILE_DIR}"

# 1. Environment & Java detection
if [ -z "${JAVA_HOME:-}" ]; then
  if [ -d "/opt/homebrew/Cellar/openjdk@17/17.0.21.0.3/libexec/openjdk.jdk/Contents/Home" ]; then
    export JAVA_HOME="/opt/homebrew/Cellar/openjdk@17/17.0.21.0.3/libexec/openjdk.jdk/Contents/Home"
  elif command -v /usr/libexec/java_home >/dev/null 2>&1; then
    export JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home 2>/dev/null || echo "")"
  fi
fi

if [ -n "${JAVA_HOME:-}" ]; then
  export PATH="${JAVA_HOME}/bin:${PATH}"
fi

# 2. Android SDK & ADB detection
if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -d "/opt/homebrew/share/android-commandlinetools" ]; then
    export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
  elif [ -d "${HOME}/Library/Android/sdk" ]; then
    export ANDROID_HOME="${HOME}/Library/Android/sdk"
  fi
fi

if [ -n "${ANDROID_HOME:-}" ]; then
  export PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/35.0.0:${PATH}"
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "[-] ERROR: adb not found. Please install Android Platform Tools." >&2
  exit 1
fi

# 3. Maestro CLI detection
if [ -d "${HOME}/.maestro/bin" ]; then
  export PATH="${HOME}/.maestro/bin:${PATH}"
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "[-] ERROR: maestro CLI not found in PATH or ~/.maestro/bin." >&2
  exit 1
fi
export MAESTRO_CLI_NO_ANALYTICS=true

# 4. Device detection
DEVICES_OUTPUT="$(adb devices -l | grep -v "List of devices attached" | grep -v "^$" || true)"
if [ -z "${DEVICES_OUTPUT}" ]; then
  echo "[-] ERROR: No Android devices attached over ADB." >&2
  exit 1
fi

DEVICE_ID="$(echo "${DEVICES_OUTPUT}" | head -n 1 | awk '{print $1}')"
DEVICE_MODEL="$(adb -s "${DEVICE_ID}" shell getprop ro.product.model | tr -d '\r')"
DEVICE_OS="$(adb -s "${DEVICE_ID}" shell getprop ro.build.version.release | tr -d '\r')"
DEVICE_SDK="$(adb -s "${DEVICE_ID}" shell getprop ro.build.version.sdk | tr -d '\r')"
DEVICE_ABI="$(adb -s "${DEVICE_ID}" shell getprop ro.product.cpu.abi | tr -d '\r')"

echo "[+] Attached Target Device:"
echo "    ID:      ${DEVICE_ID}"
echo "    Model:   ${DEVICE_MODEL}"
echo "    OS:      Android ${DEVICE_OS} (API ${DEVICE_SDK})"
echo "    ABI:     ${DEVICE_ABI}"

# 5. Check Package Installation
if ! adb -s "${DEVICE_ID}" shell pm list packages --user 0 | grep -q "package:org.oncobrief.patient"; then
  echo "[-] ERROR: org.oncobrief.patient is not installed on ${DEVICE_ID}." >&2
  exit 1
fi
echo "[+] Verified package installed: org.oncobrief.patient"

# 6. Configure Reverse Port Forwarding
echo "[+] Configuring ADB reverse port forwarding (8081 for Metro, 3000 for Patient Portal)..."
adb -s "${DEVICE_ID}" reverse tcp:8081 tcp:8081
adb -s "${DEVICE_ID}" reverse tcp:3000 tcp:3000

# 7. Device Screen Wake
echo "[+] Ensuring screen is awake and unlocked..."
adb -s "${DEVICE_ID}" shell input keyevent KEYCODE_WAKEUP
adb -s "${DEVICE_ID}" shell wm dismiss-keyguard

# 8. Run Maestro Patient Smoke Test Flow
echo "[+] Initializing clean app state for smoke test flow..."
adb -s "${DEVICE_ID}" shell pm clear org.oncobrief.patient
adb -s "${DEVICE_ID}" reverse tcp:8081 tcp:8081
adb -s "${DEVICE_ID}" reverse tcp:3000 tcp:3000
adb -s "${DEVICE_ID}" shell am start --user 0 -n org.oncobrief.patient/.MainActivity
sleep 3

echo "[+] Running Maestro patient smoke test flow (offline demo + tab navigation + Tamil i18n)..."
cd "${REPO_ROOT}"
maestro --device "${DEVICE_ID}" test --no-ansi apps/mobile/maestro/patient-smoke.yaml

# 9. Run Maestro Connected Portal Test Flow
echo "[+] Running Maestro connected portal test flow (OTP auth + live PostgreSQL + snapshot)..."
# Clear app state to test clean signin
adb -s "${DEVICE_ID}" shell pm clear org.oncobrief.patient
adb -s "${DEVICE_ID}" reverse tcp:8081 tcp:8081
adb -s "${DEVICE_ID}" reverse tcp:3000 tcp:3000
adb -s "${DEVICE_ID}" shell am start --user 0 -n org.oncobrief.patient/.MainActivity
sleep 2

maestro --device "${DEVICE_ID}" test --no-ansi apps/mobile/maestro/patient-connected.yaml

# 10. Audit Logcat for Fatal Exceptions
echo "[+] Auditing logcat for any fatal crashes or unhandled exceptions..."
CRASHES="$(adb -s "${DEVICE_ID}" logcat -d *:E | grep "FATAL EXCEPTION" | grep "org.oncobrief.patient" || true)"
if [ -n "${CRASHES}" ]; then
  echo "[-] ERROR: Detected fatal exception in logcat:" >&2
  echo "${CRASHES}" >&2
  exit 1
fi
echo "[+] Zero fatal exceptions detected in device logcat."

echo "========================================================"
echo "  MOB-023 RUNTIME VERIFICATION SUCCESS"
echo "  Device:       ${DEVICE_MODEL} (Android ${DEVICE_OS}, API ${DEVICE_SDK})"
echo "  Package:      org.oncobrief.patient"
echo "  Maestro:      2/2 flows passed (smoke + connected)"
echo "  Backend:      Live PostgreSQL via ADB reverse (port 3000)"
echo "  Crashes:      0 fatal exceptions"
echo "========================================================"

exit 0
