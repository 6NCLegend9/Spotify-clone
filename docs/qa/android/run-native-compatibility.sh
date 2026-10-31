#!/usr/bin/env bash
set -euo pipefail
qa_root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$qa_root"
if [[ "${CI:-}" != "true" || "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" != "1" ]]; then
  echo "Historical native compatibility runs require an isolated CI emulator." >&2
  exit 1
fi
compat_root="$(mktemp -d "${RUNNER_TEMP:-/tmp}/haykasa-native-compat.XXXXXX")"
compat_artifacts="$qa_root/artifacts/android-emulator/compatibility"
mkdir -p "$compat_artifacts"
collect_compatibility() {
  local status=$?
  for version in 0 1; do
    adb pull "/sdcard/Download/haykasa-emulator-qa/compatibility-v$version.json" "$compat_artifacts/" >/dev/null 2>&1 || true
  done
  # This directory was created above solely for disposable historical builds.
  rm -rf "$compat_root"
  exit "$status"
}
trap collect_compatibility EXIT
for entry in \
  "1:ee493867576844d3cc758486fdb1d01648ae1266:4" \
  "0:fbaae39eae5c7e70d896955d2ca8b5c4933c608e:3"; do
  IFS=: read -r version baseline build <<< "$entry"
  if ! git cat-file -e "$baseline^{commit}" 2>/dev/null; then git fetch --no-tags --depth=1 origin "$baseline"; fi
  checkout="$compat_root/v$version"
  mkdir -p "$checkout" "$compat_artifacts/v$version"
  git archive "$baseline" android | tar -x -C "$checkout"
  test_dir="$checkout/android/app/src/androidTest/java/app/haykasa/android"
  cp "$qa_root/android/app/src/androidTest/java/app/haykasa/android/NativeCompatibilityTest.java" "$test_dir/"
  mkdir -p "$checkout/android/app/build/generated/qaAssets"
  cp -R "$qa_root/android/app/build/generated/qaAssets/." "$checkout/android/app/build/generated/qaAssets/"
  # Main Java/resources/Gradle come only from the pinned baseline. New test/JS assets are explicit.
  printf '%s\n' "$baseline" > "$compat_artifacts/v$version/native-baseline.txt"
  sha256sum "$checkout/android/app/src/main/java/app/haykasa/android/PlaybackService.java" \
    "$checkout/android/app/src/main/java/app/haykasa/android/MainActivity.java" \
    "$checkout/android/app/build/generated/qaAssets/native-qa.html" > "$compat_artifacts/v$version/inputs.sha256"
  adb shell am force-stop app.haykasa.android.debug || true
  adb uninstall app.haykasa.android.debug.test >/dev/null 2>&1 || true
  adb uninstall app.haykasa.android.debug >/dev/null 2>&1 || true
  status=0
  "$checkout/android/gradlew" -p "$checkout/android" --no-daemon \
    -Pandroid.testInstrumentationRunnerArguments.class=app.haykasa.android.NativeCompatibilityTest \
    -Pandroid.testInstrumentationRunnerArguments.expectedTransportVersion="$version" \
    -Pandroid.testInstrumentationRunnerArguments.expectedNativeBuildCode="$build" \
    -Pandroid.testInstrumentationRunnerArguments.nativeBaseline="$baseline" \
    connectedDebugAndroidTest || status=$?
  cp -R "$checkout/android/app/build/outputs/androidTest-results" "$compat_artifacts/v$version/" 2>/dev/null || true
  if [[ "$status" -ne 0 ]]; then exit "$status"; fi
done
# Restore the current QA app; historical packages are never distributed.
adb uninstall app.haykasa.android.debug.test >/dev/null 2>&1 || true
adb uninstall app.haykasa.android.debug >/dev/null 2>&1 || true
adb install -r -t "$qa_root/android/app/build/outputs/apk/debug/app-debug.apk" >/dev/null
