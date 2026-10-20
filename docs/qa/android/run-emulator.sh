#!/usr/bin/env bash
set -euo pipefail
qa_root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$qa_root"
# Both paths contain only disposable evidence from this isolated emulator run.
# Remove previous runs so a missing screenshot/JSON cannot pass as fresh output.
rm -rf "$qa_root/artifacts/android-emulator"
adb shell rm -rf /sdcard/Download/haykasa-emulator-qa
qa_server_pid=""
collect_device_evidence() {
  local test_status=$?
  mkdir -p "$qa_root/artifacts/android-emulator"
  adb logcat -d HayKasaWebQA:D HayKasaMediaQA:D '*:S' > "$qa_root/artifacts/android-emulator/playback-diagnostics.log" 2>&1 || true
  adb logcat -d AndroidRuntime:E '*:S' > "$qa_root/artifacts/android-emulator/crashes.log" 2>&1 || true
  adb shell dumpsys activity services app.haykasa.android.debug > "$qa_root/artifacts/android-emulator/services.txt" 2>&1 || true
  adb pull /sdcard/Download/haykasa-emulator-qa "$qa_root/artifacts/android-emulator/screenshots" || true
  if [[ -n "$qa_server_pid" ]]; then kill "$qa_server_pid" 2>/dev/null || true; fi
  adb reverse --remove tcp:3011 >/dev/null 2>&1 || true
  if [[ "$test_status" -eq 0 ]] && { [[ ! -s "$qa_root/artifacts/android-emulator/screenshots/live-playback.json" ]] || [[ ! -s "$qa_root/artifacts/android-emulator/screenshots/ui-tour.jsonl" ]]; }; then
    echo "Android tests did not produce the required playback/tour evidence." >&2
    exit 1
  fi
}
trap collect_device_evidence EXIT
adb logcat -c
mkdir -p "$qa_root/artifacts/android-emulator"
if [[ ! -f "$qa_root/.next/BUILD_ID" ]]; then
  echo "Build the current web source before running emulator QA (DISABLE_PWA=1 npm run build)." >&2
  exit 1
fi
# The androidTest-only interceptor serves this exact compiled web source while
# preserving the APK's production origin. APIs and YouTube remain live remote
# requests; this is explicitly staging evidence, never a production deployment.
NEXTAUTH_URL=https://haykasa.vercel.app NEXTAUTH_SECRET=isolated-android-qa-secret JWT_SECRET=isolated-android-qa-secret \
  node "$qa_root/node_modules/next/dist/bin/next" start --hostname 127.0.0.1 --port 3011 \
  > "$qa_root/artifacts/android-emulator/current-web-server.log" 2>&1 &
qa_server_pid=$!
qa_server_ready=0
for ((qa_attempt=0; qa_attempt<60; qa_attempt++)); do
  if curl --fail --silent --max-time 2 --output /dev/null http://127.0.0.1:3011/; then qa_server_ready=1; break; fi
  if ! kill -0 "$qa_server_pid" 2>/dev/null; then break; fi
  sleep 1
done
if [[ "$qa_server_ready" -ne 1 ]]; then echo "Current-source QA server did not start." >&2; exit 1; fi
adb reverse tcp:3011 tcp:3011
qa_commit="${GITHUB_SHA:-$(git -C "$qa_root" rev-parse HEAD)}"
if [[ ! "$qa_commit" =~ ^[a-f0-9]{40}$ ]]; then echo "Invalid QA source commit." >&2; exit 1; fi
"$qa_root/android/gradlew" -p "$qa_root/android" --no-daemon \
  -Pandroid.testInstrumentationRunnerArguments.qaCurrentWeb=1 \
  -Pandroid.testInstrumentationRunnerArguments.qaCommit="$qa_commit" \
  connectedDebugAndroidTest
