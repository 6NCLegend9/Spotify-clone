import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

// Exercise the runner's actual EXIT trap at a controlled device boundary. This
// check needs Bash/Node, not an emulator, application server or Android SDK.
const source = (await readFile(new URL("./run-emulator.sh", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const trapEnd = source.indexOf("trap collect_device_evidence EXIT");
const helperStart = source.indexOf("qa_adb() {");
assert(helperStart >= 0 && trapEnd > helperStart, "Android QA must bound its device commands");
const functions = source.slice(helperStart, trapEnd);
const initialization = source.slice(source.indexOf('qa_server_pid=""'), helperStart);
assert(initialization.includes('qa_sampler_pid=""'), "Cleanup fixture uses the runner's sampler initialization");
const root = await mkdtemp(join(tmpdir(), "haykasa-android-cleanup-"));
const bin = join(root, "bin");
await mkdir(bin);
await writeFile(join(bin, "adb"), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$QA_ADB_MODE" == hang && "$1" == logcat && "\${3:-}" == HayKasaWebQA:D ]]; then
  echo "$$" > "$QA_ADB_PID_FILE"
  exec sleep 60
fi
if [[ "$QA_ADB_MODE" == offline ]]; then exit 1; fi
if [[ "$1" == pull && ( "$QA_ADB_MODE" == evidence || "$QA_ADB_MODE" == partial || "$QA_ADB_MODE" == invalid ) ]]; then
  mkdir -p "$3"
  if [[ "$QA_ADB_MODE" != invalid ]]; then
    printf '{}' > "$3/live-playback.json"
    printf '{}' > "$3/ui-tour.jsonl"
  else
    printf '{' > "$3/live-playback.json"
    printf '{' > "$3/ui-tour.jsonl"
  fi
  if [[ "$QA_ADB_MODE" == partial ]]; then exit 124; fi
fi
`, { mode: 0o755 });
await writeFile(join(bin, "mkdir"), `#!/usr/bin/env bash
if [[ "$QA_ADB_MODE" == directory ]]; then exit 23; fi
exec /bin/mkdir "$@"
`, { mode: 0o755 });

for (const readyAfter of [1, 3, 4]) {
  const probe = spawnSync("bash", ["-c", `
set -euo pipefail
${functions}
attempts=0
qa_adb() { attempts=$((attempts+1)); [[ "$attempts" -ge ${readyAfter} ]]; }
sleep() { :; }
if wait_for_device_storage; then
  [[ "$attempts" -eq ${readyAfter} ]] || exit 99
else
  [[ "$attempts" -eq 3 ]] || exit 99
  exit 1
fi
`, "android-readiness-check"], { encoding: "utf8", timeout: 2000 });
  assert.ifError(probe.error);
  assert.equal(probe.status, readyAfter <= 3 ? 0 : 1, probe.stderr);
}

const results = [];
try {
  for (const test of [
    { name: "successful tests retain fresh evidence", mode: "evidence", status: 0, expected: 0 },
    { name: "sampler shutdown preserves success", mode: "evidence", status: 0, expected: 0, sampler: true },
    { name: "sampler shutdown preserves failure", mode: "evidence", status: 7, expected: 7, sampler: true },
    { name: "missing evidence cannot pass", mode: "missing", status: 0, expected: 1 },
    { name: "device errors preserve the test failure", mode: "offline", status: 7, expected: 7 },
    { name: "a partial failed pull cannot pass", mode: "partial", status: 0, expected: 1 },
    { name: "truncated evidence cannot pass", mode: "invalid", status: 0, expected: 1 },
    { name: "directory errors preserve the test failure", mode: "directory", status: 7, expected: 7 },
    { name: "directory errors cannot pass", mode: "directory", status: 0, expected: 1 },
    { name: "hung device collection is bounded and preserves failure", mode: "hang", status: 9, expected: 9 },
  ]) {
    const caseRoot = join(root, `${test.mode}-${test.status}-${Boolean(test.sampler)}`);
    await mkdir(caseRoot);
    const pidFile = join(caseRoot, "adb.pid");
    const started = Date.now();
    const result = spawnSync("bash", ["-c", `
set -euo pipefail
qa_root="$1"
${initialization}
${functions}
trap collect_device_evidence EXIT
${test.sampler ? `node "$3" > "$qa_root/sampler.jsonl" &
qa_sampler_pid=$!
printf '%s' "$qa_sampler_pid" > "$qa_root/sampler.pid"
for ((attempt=0; attempt<50; attempt++)); do
  if [[ -s "$qa_root/sampler.jsonl" ]]; then break; fi
  sleep .1
done
[[ -s "$qa_root/sampler.jsonl" ]] || exit 88` : ""}
exit "$2"
`, "android-cleanup-check", caseRoot, String(test.status), fileURLToPath(new URL("./host-sampler.mjs", import.meta.url))], {
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH || ""}`, QA_ADB_MODE: test.mode, QA_ADB_PID_FILE: pidFile },
      encoding: "utf8",
      timeout: 20_000,
      killSignal: "SIGKILL",
    });
    const elapsedMs = Date.now() - started;
    // A red timeout check must not leave its controlled sleep process running.
    try {
      const pid = Number(await readFile(pidFile, "utf8"));
      if (Number.isSafeInteger(pid) && pid > 1) process.kill(pid, "SIGKILL");
    } catch (error) {
      if (!["ENOENT", "ESRCH"].includes(error.code)) throw error;
    }
    assert.ifError(result.error);
    assert.equal(result.status, test.expected, `${test.name}: ${result.stderr}`);
    if (test.sampler) {
      const rows = (await readFile(join(caseRoot, "sampler.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
      assert(rows.length >= 2, "Actual sampler emits initial and final shutdown records");
      const pid = Number(await readFile(join(caseRoot, "sampler.pid"), "utf8"));
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, "Cleanup must wait for sampler exit");
    }
    if (test.mode === "hang") {
      assert(elapsedMs < 15_000, "Lost-device evidence collection must finish within its bounded probe window");
      const diagnostic = await readFile(join(caseRoot, "artifacts/android-emulator/playback-diagnostics.log"), "utf8");
      assert.match(diagnostic, /ETIMEDOUT/, "Retain the device timeout in exported diagnostics");
    }
    results.push({ name: test.name, passed: true, elapsedMs });
  }
  console.log(JSON.stringify({ passed: true, cases: results }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
