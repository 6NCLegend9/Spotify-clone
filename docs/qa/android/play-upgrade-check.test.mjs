import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "haykasa-play-upgrade-"));
const adb = join(directory, "adb");
const baseline = join(directory, "baseline.json");
const checker = new URL("./play-upgrade-check.mjs", import.meta.url).pathname;
writeFileSync(adb, `#!/usr/bin/env node
const sample = JSON.parse(process.env.HAYKASA_ADB_FIXTURE);
const command = process.argv.slice(2).join(' ');
if (command === 'shell getprop ro.kernel.qemu' || command === 'shell getprop ro.boot.qemu') console.log('0');
else if (command === 'shell pm list packages -i app.haykasa.android') console.log('package:app.haykasa.android installer=' + sample.installer);
else if (command === 'shell dumpsys package app.haykasa.android') console.log('Package [app.haykasa.android]:\\n versionCode=' + sample.version + ' minSdk=23\\n firstInstallTime=' + sample.first + '\\n lastUpdateTime=' + sample.last + '\\n installerPackageName=' + sample.installer + '\\n initiatingPackageName=' + sample.initiator);
else if (command === 'get-serialno') console.log(sample.serial);
else process.exit(2);
`, { mode: 0o700 });

const original = { installer: "com.android.vending", initiator: "com.android.vending", version: 5,
  first: "2026-11-01 10:00:00", last: "2026-11-01 10:00:00", serial: "physical-phone" };
const upgraded = { ...original, version: 6, last: "2026-11-21 10:00:00" };
function run(mode, fixture, expectedVersion) {
  return spawnSync(process.execPath, [checker, mode, baseline, ...(expectedVersion ? [String(expectedVersion)] : [])], {
    encoding: "utf8", env: { ...process.env, ADB: adb, HAYKASA_ADB_FIXTURE: JSON.stringify(fixture) },
  });
}
try {
  assert.equal(run("capture", original).status, 0);
  assert.equal(run("verify", upgraded, 6).status, 0);
  for (const fixture of [
    { ...upgraded, installer: "com.android.shell" },
    { ...upgraded, initiator: "com.android.shell" },
    { ...upgraded, first: "2026-11-21 10:00:00" },
    { ...upgraded, serial: "another-phone" },
    { ...upgraded, version: 5 },
  ]) assert.notEqual(run("verify", fixture, 6).status, 0);
  assert.notEqual(run("verify", upgraded, 7).status, 0);
  console.log("PASS: Play upgrade provenance and in-place update fixture checks");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
