#!/usr/bin/env bash
set -euo pipefail

# OncoBrief Mobile - MOB-022 Native Android Build Verification Script
# Strict non-diagnostic clinical boundary: Builds and packages authenticated, privacy-hardened client only.

echo "========================================================"
echo "  ONCOBRIEF MOB-022: NATIVE ANDROID BUILD VERIFICATION"
echo "========================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MOBILE_DIR="${REPO_ROOT}/apps/mobile"
ANDROID_DIR="${MOBILE_DIR}/android"
APK_PATH="${ANDROID_DIR}/app/build/outputs/apk/debug/app-debug.apk"

echo "Repo root:   ${REPO_ROOT}"
echo "Mobile dir:  ${MOBILE_DIR}"
echo "Android dir: ${ANDROID_DIR}"

# 1. Environment and Java detection
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

if ! command -v java >/dev/null 2>&1; then
  echo "[-] ERROR: java runtime not found. Please install JDK 17." >&2
  exit 1
fi

JAVA_VERSION_OUTPUT="$(java -version 2>&1 | head -n 1)"
echo "[+] Detected Java: ${JAVA_VERSION_OUTPUT}"

# 2. Android SDK detection
if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -d "/opt/homebrew/share/android-commandlinetools" ]; then
    export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
  elif [ -d "${HOME}/Library/Android/sdk" ]; then
    export ANDROID_HOME="${HOME}/Library/Android/sdk"
  fi
fi

if [ -n "${ANDROID_HOME:-}" ]; then
  export PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/35.0.0:${PATH}"
  echo "[+] Detected ANDROID_HOME: ${ANDROID_HOME}"
else
  echo "[!] WARNING: ANDROID_HOME not set. Build may fail if Android SDK is required." >&2
fi

# 3. Verify native privacy & backup configuration
echo "[+] Checking app.json and AndroidManifest.xml privacy settings..."
cd "${MOBILE_DIR}"

if ! grep -q '"allowBackup": false' app.json; then
  echo "[-] ERROR: app.json must have allowBackup: false" >&2
  exit 1
fi

if ! grep -q 'android:allowBackup="false"' "${ANDROID_DIR}/app/src/main/AndroidManifest.xml"; then
  echo "[-] ERROR: AndroidManifest.xml must specify android:allowBackup=\"false\"" >&2
  exit 1
fi

# 4. Verify Hermes Android bundle export
echo "[+] Exporting platform android bundle to verify Hermes bytecode..."
npx expo export --platform android --output-dir /tmp/oncobrief-android-export >/dev/null 2>&1 || {
  echo "[-] ERROR: npx expo export --platform android failed." >&2
  exit 1
}
echo "[+] Expo android export completed successfully."

# 5. Build debug APK using Gradle
echo "[+] Executing Gradle assembleDebug..."
cd "${ANDROID_DIR}"
./gradlew assembleDebug

# 6. Verify APK artifact
if [ ! -f "${APK_PATH}" ]; then
  echo "[-] ERROR: Expected APK not found at: ${APK_PATH}" >&2
  exit 1
fi

APK_SIZE="$(ls -lh "${APK_PATH}" | awk '{print $5}')"
APK_SHA="$(shasum -a 256 "${APK_PATH}" | awk '{print $1}')"

echo "========================================================"
echo "  BUILD SUCCESS"
echo "  Artifact: ${APK_PATH}"
echo "  Size:     ${APK_SIZE}"
echo "  SHA-256:  ${APK_SHA}"
echo "========================================================"

# 7. Package verification using aapt if available
if command -v aapt >/dev/null 2>&1; then
  PKG_NAME="$(aapt dump badging "${APK_PATH}" | grep "package: name=" | sed -E "s/.*package: name='([^']+)'.*/\1/")"
  LAUNCH_ACT="$(aapt dump badging "${APK_PATH}" | grep "launchable-activity: name=" | sed -E "s/.*launchable-activity: name='([^']+)'.*/\1/")"
  echo "[+] Package:           ${PKG_NAME}"
  echo "[+] Launcher Activity: ${LAUNCH_ACT}"
fi

exit 0
