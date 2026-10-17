#!/usr/bin/env bash
set -euo pipefail
qa_root="$(cd "$(dirname "$0")/../../.." && pwd)"
collect_device_evidence() {
  mkdir -p "$qa_root/artifacts/android-emulator"
  adb logcat -d AndroidRuntime:E '*:S' > "$qa_root/artifacts/android-emulator/crashes.log" 2>&1 || true
  adb shell dumpsys activity services app.haykasa.android.debug > "$qa_root/artifacts/android-emulator/services.txt" 2>&1 || true
  adb pull /sdcard/Download/haykasa-emulator-qa "$qa_root/artifacts/android-emulator/screenshots" || true
}
trap collect_device_evidence EXIT
adb logcat -c
"$qa_root/android/gradlew" -p "$qa_root/android" --no-daemon connectedDebugAndroidTest
