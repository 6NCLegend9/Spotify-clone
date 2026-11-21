// Capture a Play-installed baseline, then verify an in-place upgrade on the same device.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const [mode, baselinePath, expectedVersion] = process.argv.slice(2);
if (!["capture", "verify"].includes(mode) || !baselinePath ||
    (expectedVersion !== undefined && (mode !== "verify" || !/^[1-9]\d*$/.test(expectedVersion) || !Number.isSafeInteger(Number(expectedVersion))))) {
  throw new Error("Usage: node play-upgrade-check.mjs capture BASELINE.json | verify BASELINE.json [EXPECTED_VERSION_CODE]");
}
const adb = process.env.ADB || "adb";
const run = (...args) => execFileSync(adb, args, { encoding: "utf8", timeout: 15000 }).trim();
const app = "app.haykasa.android";
for (const property of ["ro.kernel.qemu", "ro.boot.qemu"]) {
  assert(["", "0"].includes(run("shell", "getprop", property)), "Use a physical Android device");
}
const installed = run("shell", "pm", "list", "packages", "-i", app);
assert(installed.split(/\r?\n/).includes(`package:${app} installer=com.android.vending`),
  "The production package must be installed by Google Play");
const packageInfo = run("shell", "dumpsys", "package", app);
// A sideload can set an installer label. Android separately records the app
// which initiated the install; both fields must identify Play.
assert(/^\s*initiatingPackageName=com\.android\.vending\s*$/m.test(packageInfo) &&
    /^\s*installerPackageName=com\.android\.vending\s*$/m.test(packageInfo),
  "Android must report Google Play as both initiating and installer package");
const versionCode = Number(packageInfo.match(/\bversionCode=(\d+)/)?.[1]);
const firstInstallTime = packageInfo.match(/^\s*firstInstallTime=(.+)$/m)?.[1]?.trim();
const lastUpdateTime = packageInfo.match(/^\s*lastUpdateTime=(.+)$/m)?.[1]?.trim();
assert(Number.isSafeInteger(versionCode) && versionCode > 0 && firstInstallTime && lastUpdateTime,
  "Android package version and installation times must be available");
const serial = run("get-serialno");
assert(serial && serial !== "unknown", "Select one connected device with ANDROID_SERIAL");
const current = { app, versionCode, firstInstallTime, lastUpdateTime,
  device: createHash("sha256").update(serial).digest("hex") };
if (mode === "capture") {
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n", { flag: "wx", mode: 0o600 });
} else {
  const previous = JSON.parse(readFileSync(baselinePath, "utf8"));
  assert.equal(current.app, previous.app);
  assert.equal(current.device, previous.device, "Use the same physical device");
  assert.equal(current.firstInstallTime, previous.firstInstallTime, "An uninstall or reinstall invalidates the upgrade test");
  assert(current.versionCode > previous.versionCode, "Google Play must install the newer version");
  if (expectedVersion !== undefined) {
    assert.equal(current.versionCode, Number(expectedVersion), "Google Play must install the build selected for qualification");
  }
  assert(current.lastUpdateTime > previous.lastUpdateTime, "Android must report a later update time");
  console.log(`Google Play in-place upgrade verified: ${previous.versionCode} → ${current.versionCode}`);
}
