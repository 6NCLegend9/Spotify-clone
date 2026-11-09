#!/usr/bin/env bash
set -euo pipefail
qa_root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$qa_root"
# Both paths contain only disposable evidence from this isolated emulator run.
# Remove previous runs so a missing screenshot/JSON cannot pass as fresh output.
rm -rf "$qa_root/artifacts/android-emulator"
qa_server_pid=""
qa_adb() {
  # A lost emulator must not hang the EXIT trap and hide the instrumentation
  # failure. Node is already required by this runner; no timeout binary needed.
  node --input-type=commonjs -e '
    const { spawnSync } = require("node:child_process");
    const result = spawnSync("adb", process.argv.slice(1), {
      stdio: "inherit", timeout: 10_000, killSignal: "SIGKILL",
    });
    if (result.error) console.error("Android QA device command failed:", result.error.code);
    process.exit(result.status ?? (result.error?.code === "ETIMEDOUT" ? 124 : 1));
  ' -- "$@"
}
collect_device_evidence() {
  local test_status=$?
  local evidence_status=0
  trap - EXIT
  if mkdir -p "$qa_root/artifacts/android-emulator"; then
    qa_adb logcat -d HayKasaWebQA:D HayKasaMediaQA:D '*:S' > "$qa_root/artifacts/android-emulator/playback-diagnostics.log" 2>&1 || true
    qa_adb logcat -d AndroidRuntime:E '*:S' > "$qa_root/artifacts/android-emulator/crashes.log" 2>&1 || true
    qa_adb shell dumpsys activity services app.haykasa.android.debug > "$qa_root/artifacts/android-emulator/services.txt" 2>&1 || true
    qa_adb pull /sdcard/Download/haykasa-emulator-qa "$qa_root/artifacts/android-emulator/screenshots" || evidence_status=$?
  else
    evidence_status=1
  fi
  if [[ -n "$qa_server_pid" ]]; then kill "$qa_server_pid" 2>/dev/null || true; fi
  qa_adb reverse --remove tcp:3011 >/dev/null 2>&1 || true
  if [[ "$test_status" -eq 0 ]] && { [[ "$evidence_status" -ne 0 ]] || [[ ! -s "$qa_root/artifacts/android-emulator/screenshots/live-playback.json" ]] || [[ ! -s "$qa_root/artifacts/android-emulator/screenshots/ui-tour.jsonl" ]]; }; then
    echo "Android tests did not produce the required playback/tour evidence." >&2
    exit 1
  fi
  if [[ "$test_status" -eq 0 ]]; then
    node --input-type=commonjs -e '
      const fs = require("node:fs");
      try {
        JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        for (const line of fs.readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/)) JSON.parse(line);
      } catch {
        console.error("Required Android playback/tour evidence is not valid JSON.");
        process.exit(1);
      }
    ' -- "$qa_root/artifacts/android-emulator/screenshots/live-playback.json" "$qa_root/artifacts/android-emulator/screenshots/ui-tour.jsonl"
  fi
  exit "$test_status"
}
trap collect_device_evidence EXIT
qa_adb shell rm -rf /sdcard/Download/haykasa-emulator-qa
qa_adb logcat -c
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
qa_adb reverse tcp:3011 tcp:3011
qa_commit="${GITHUB_SHA:-$(git -C "$qa_root" rev-parse HEAD)}"
if [[ ! "$qa_commit" =~ ^[a-f0-9]{40}$ ]]; then echo "Invalid QA source commit." >&2; exit 1; fi
"$qa_root/android/gradlew" -p "$qa_root/android" --no-daemon \
  -Pandroid.testInstrumentationRunnerArguments.qaCurrentWeb=1 \
  -Pandroid.testInstrumentationRunnerArguments.qaCommit="$qa_commit" \
  connectedDebugAndroidTest
bash "$qa_root/docs/qa/android/run-native-compatibility.sh"
