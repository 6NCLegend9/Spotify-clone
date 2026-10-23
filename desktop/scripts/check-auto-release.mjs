import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { resolveReleaseMetadata } from "./resolve-release-metadata.mjs";
import { installationEligibleForRollout } from "../src/policy.mjs";
import { compareReleaseVersions, versionOlderThan } from "../src/version.mjs";

// Exercise the actual CLI: every blocked signed release must fail CI rather
// than report success without publishing. Fixtures never build or publish an app.
const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "haykasa-release-config-"));
const fixtureSecrets = {
  CSC_LINK: "fixture-certificate-do-not-log", CSC_KEY_PASSWORD: "fixture-password-do-not-log",
  HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET: "fixture-manifest-key-do-not-log-123456789",
};
try {
  const cases = [
    { name: "strict missing stable", status: 1, ready: false },
    { name: "strict missing beta", channel: "beta", status: 1, ready: false },
    { name: "automatic missing", automatic: true, event: "push", status: 1, ready: false },
    { name: "automatic missing beta", channel: "beta", automatic: true, event: "push", status: 1, ready: false },
    { name: "automatic partial", automatic: true, event: "push", values: { CSC_LINK: fixtureSecrets.CSC_LINK }, status: 1, ready: false },
    { name: "manual cannot opt out", automatic: true, event: "workflow_dispatch", status: 1, ready: false },
    { name: "strict ready", values: fixtureSecrets, status: 0, ready: true },
    { name: "automatic ready", automatic: true, event: "push", values: fixtureSecrets, status: 0, ready: true },
    { name: "padded key", automatic: true, event: "push", values: { ...fixtureSecrets, HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET: ` ${fixtureSecrets.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET}` }, status: 1, ready: false },
    { name: "automatic invalid beta", channel: "beta", automatic: true, event: "push", values: { ...fixtureSecrets, HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET: "short" }, status: 1, ready: false },
    { name: "short key", values: { ...fixtureSecrets, HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET: "short" }, status: 1, ready: false },
    { name: "internal without credentials", channel: "internal", status: 0, ready: true },
  ];
  for (const [index, test] of cases.entries()) {
    const output = path.join(fixtureDirectory, `output-${index}`), summary = path.join(fixtureDirectory, `summary-${index}`);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./check-release-config.mjs", import.meta.url)), ...(test.automatic ? ["--automatic"] : [])], {
      encoding: "utf8", env: { ...process.env,
        CSC_LINK: "", CSC_KEY_PASSWORD: "", HEYKASA_WINDOWS_CSC_LINK: "", HEYKASA_WINDOWS_CSC_PASSWORD: "", HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET: "",
        ...test.values, GITHUB_EVENT_NAME: test.event || "workflow_dispatch", HEYKASA_DESKTOP_RELEASE_CHANNEL: test.channel || "stable", GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
      },
    });
    assert.equal(result.status, test.status, test.name);
    assert.equal(fs.readFileSync(output, "utf8"), `ready=${test.ready}\n`, test.name);
    const diagnostic = result.stdout + result.stderr + fs.readFileSync(summary, "utf8");
    for (const secret of Object.values(fixtureSecrets)) assert(!diagnostic.includes(secret), `${test.name}: do not log secrets`);
    if (!test.ready) {
      assert.match(diagnostic, /Publication blocked/, test.name);
      if (test.automatic && test.event === "push") assert.match(diagnostic, /::error::/, `${test.name}: annotate the blocked release as a CI error`);
    }
  }
} finally { fs.rmSync(fixtureDirectory, { recursive: true, force: true }); }

const base = {
  eventName: "push", ref: "refs/heads/main", repository: "6NCLegend9/Spotify-clone", sha: "a".repeat(40),
  packageVersion: "1.1.0", currentManifest: { channel: "stable", latest: "1.2.8", minimum: "1.0.1" },
  tags: ["desktop-v1.2.9", "desktop-v1.2.10", "desktop-beta-v99.0.0", "desktop-internal-v100.0.0"],
};
const resolve = changes => resolveReleaseMetadata({ ...base, ...changes });
const automatic = resolve({});
assert.equal(automatic.channel, "stable");
assert.equal(automatic.version, "1.2.11", "Advance beyond both published and reserved versions using numeric ordering");
assert.equal(automatic.minimum_version, "1.0.1", "Preserve the supported minimum");
assert.equal(automatic.release_notes_url, "https://github.com/6NCLegend9/Spotify-clone/releases/tag/desktop-v1.2.11");
assert.equal(resolve({ tags: [], currentManifest: { ...base.currentManifest, latest: "1.0.0", minimum: "1.0.0" } }).version, "1.1.1", "First release advances the package baseline");
assert.equal(resolve({ tags: [], currentManifest: { ...base.currentManifest, latest: "2.0.8" } }).version, "2.0.9", "Production can be ahead of tags");
assert.equal(resolve({ tags: ["desktop-v1.2.65535"] }).version, "1.3.0", "Windows patch overflow advances the minor version");
assert.equal(resolve({ tags: ["desktop-v1.65535.65535"] }).version, "2.0.0");
assert.throws(() => resolve({ tags: ["desktop-v65535.65535.65535"] }));
for (const changes of [
  { eventName: "pull_request" }, { ref: "refs/heads/feature" }, { sha: "not-a-commit" },
  { currentManifest: null }, { currentManifest: { ...base.currentManifest, channel: "beta" } },
  { currentManifest: { ...base.currentManifest, latest: "corrupted" } },
  { currentManifest: { ...base.currentManifest, minimum: "3.0.0" } },
  { packageVersion: "1.1.0-internal" }, { tags: ["desktop-v1.2.99999999999999999999"] },
]) assert.throws(() => resolve(changes), JSON.stringify(changes));
for (const channel of ["internal", "beta", "stable"]) {
  const manual = resolve({ eventName: "workflow_dispatch", inputs: { channel, version: "3.0.0", minimum_version: "1.0.0", release_notes_url: "https://example.invalid/notes" } });
  assert.equal(manual.channel, channel); assert.equal(manual.version, "3.0.0");
}
for (const inputs of [
  { channel: "unknown", version: "3.0.0" }, { channel: "stable", version: "3.0.0-beta" },
  { channel: "stable", version: "3.0.0" },
  { channel: "internal", version: "3.0.0", minimum_version: "4.0.0" },
  { channel: "beta", version: "3.0.0", release_notes_url: "https://user:password@example.invalid/notes" },
  { channel: "beta", version: "3.0.0", release_notes_url: "https://example.invalid\nversion=bad" },
]) assert.throws(() => resolve({ eventName: "workflow_dispatch", inputs }));

// Exercise the actual updater against a newly published automatic release.
// Imports are substituted so this test never downloads or installs anything.
let checkCount = 0, installs = 0, feed;
const publishedManifest = {
  channel: "stable", latest: automatic.version, minimum: automatic.minimum_version,
  published: true, signed: true, downloadUrl: "https://example.invalid/HayKasa.exe",
  sha512: "a".repeat(86) + "==", sizeBytes: 100,
};
let manifest = publishedManifest;
const listeners = new Map(), statuses = [];
const engine = {
  on: (name, callback) => listeners.set(name, callback),
  setFeedURL: value => { feed = value; },
  checkForUpdates: async () => {
    checkCount++;
    listeners.get("update-available")({ version: manifest.latest });
    listeners.get("download-progress")({ percent: 50 });
    listeners.get("update-downloaded")({ version: manifest.latest });
  },
  quitAndInstall: () => { installs++; },
};
let updaterCode = fs.readFileSync(new URL("../src/updater.mjs", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?from ["'][^"']+["'];\r?\n/gm, "")
  .replace("export class DesktopUpdater", "globalThis.DesktopUpdater = class DesktopUpdater");
const sandbox = {
  updaterPackage: { autoUpdater: engine }, DESKTOP_API_VERSION: 1, DESKTOP_BUILD_CHANNEL: "stable",
  UPDATE_FEED_BASE_URL: "https://haykasa.vercel.app/api/desktop/update",
  UPDATE_MANIFEST_URL: "https://haykasa.vercel.app/api/desktop/manifest", UPDATE_PREFLIGHT_TIMEOUT_MS: 1000,
  UPDATE_CHECK_INTERVAL_MS: 1000, UPDATE_INITIAL_DELAY_JITTER_MS: 0, UPDATE_INITIAL_DELAY_MIN_MS: 0,
  effectiveUpdateChannel: () => "stable", installationEligibleForRollout,
  compareReleaseVersions, versionOlderThan, URL, AbortSignal, process: { env: {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  fetch: async () => ({ ok: true, json: async () => manifest }),
};
vm.runInNewContext(updaterCode, sandbox);
const notices = [], rendererMessages = [];
class Notification {
  static isSupported() { return true; }
  constructor(options) { this.options = options; }
  on() {}
  show() { notices.push(this.options); }
}
const mainSource = fs.readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
const notificationCode = mainSource.slice(mainSource.indexOf("function showNativeUpdateNotification("), mainSource.indexOf("async function applyPolicy("));
assert(notificationCode.includes("function sendUpdateStatus("));
const native = vm.createContext({
  Notification, process: { platform: "win32" }, logger: null,
  resourceIconPath: () => "/isolated/icon.png", showMainWindow() {}, canMessageRenderer: () => true,
  mainWindow: { webContents: { send: (...message) => rendererMessages.push(message) } },
});
vm.runInContext(`let lastNativeUpdateNotificationVersion = ""; ${notificationCode}`, native);
const updater = new sandbox.DesktopUpdater({
  app: { isPackaged: true, getVersion: () => "1.2.8" },
  store: { get: () => undefined }, onStatus: state => { statuses.push(state.state); native.sendUpdateStatus(state); }, rolloutPercent: () => 100,
});
await updater.checkNow();
assert.equal(checkCount, 1);
assert.equal(feed.url, "https://haykasa.vercel.app/api/desktop/update/stable");
assert.deepEqual(statuses, ["checking", "available", "downloading", "ready"]);
assert.equal(engine.autoDownload, true); assert.equal(engine.autoInstallOnAppQuit, true);
assert.equal(updater.getStatus().version, automatic.version);
assert.match(updater.getStatus().detail, /Restart HayKasa/);
assert.equal(installs, 0, "Downloading never forces an immediate restart");
assert.equal(notices.length, 1, "Downloaded update triggers the Windows notification");
assert(notices[0].title.includes(automatic.version));
assert.match(notices[0].body, /restart/i);
assert.equal(rendererMessages.at(-1)[1].state, "ready", "The app receives restart-button state");
native.sendUpdateStatus(updater.getStatus());
assert.equal(notices.length, 1, "Repeated state messages do not duplicate Windows notifications");
await updater.installReadyUpdate(); assert.equal(installs, 1);
updater.dispose();

// A missing installation ID is outside a 25% rollout (bucket 99).
for (const test of [
  { name: "manual update opts into staged release", manual: true, percent: 25, state: "ready", checks: 1 },
  { name: "automatic update retains staged rollout", percent: 25, state: "deferred", checks: 0 },
  { name: "zero rollout remains paused for manual checks", manual: true, percent: 0, state: "deferred", checks: 0 },
  { name: "equal version is current outside rollout", installed: automatic.version, percent: 25, state: "up-to-date", checks: 0 },
  { name: "older release cannot replace newer installation", installed: "99.0.0", percent: 25, state: "up-to-date", checks: 0 },
  { name: "manual stable upgrade from prerelease", installed: `${automatic.version}-beta.1`, manual: true, percent: 25, state: "ready", checks: 1 },
  { name: "manual update cannot bypass signature", manual: true, percent: 25, manifest: { signed: false }, state: "disabled", checks: 0 },
  { name: "manual update cannot bypass integrity", manual: true, percent: 25, manifest: { sha512: "invalid" }, state: "error", checks: 0 },
  { name: "manual update cannot invent a release", manual: true, percent: 25, manifest: { published: false }, state: "disabled", checks: 0 },
  { name: "required minimum keeps existing rollout exception", installed: "1.0.0", percent: 0, state: "ready", checks: 1 },
  { name: "automatic updates can remain disabled", autoUpdate: false, percent: 100, state: "disabled", checks: 0 },
  { name: "explicit check works with automatic updates disabled", autoUpdate: false, manual: true, percent: 25, state: "ready", checks: 1 },
]) {
  manifest = { ...publishedManifest, ...test.manifest };
  const before = checkCount;
  const candidate = new sandbox.DesktopUpdater({
    app: { isPackaged: true, getVersion: () => test.installed || "1.2.8" },
    store: { get: key => key === "autoUpdate" ? test.autoUpdate : undefined },
    rolloutPercent: () => test.percent,
  });
  const state = await candidate.checkNow({ manual: test.manual === true });
  assert.equal(state.state, test.state, test.name);
  assert.equal(checkCount - before, test.checks, `${test.name}: native download checks`);
  if (test.checks) assert.equal(state.version, manifest.latest, `${test.name}: exact newer release version`);
  candidate.dispose();
}
console.log("PASS: signing readiness, blocked signed releases fail CI, secret redaction, automatic stable versioning, preserved internal/manual channels, updater discovery/download/restart states and Windows notification");
console.log("PASS: manual and automatic rollout, paused releases, current/newer/prerelease versions and preserved signature/integrity gates");

const { verifiedManifest } = await import("./check-release-delivery.mjs");
manifest = verifiedManifest;
const delivered = new sandbox.DesktopUpdater({
  app: { isPackaged: true, getVersion: () => "1.0.0" },
  store: { get: () => undefined }, rolloutPercent: () => 100,
});
const previousInstalls = installs;
const deliveredStatus = await delivered.checkNow({ manual: true });
assert.equal(deliveredStatus.state, "ready");
assert.equal(deliveredStatus.version, verifiedManifest.latest);
assert.equal(installs, previousInstalls, "Discovery/download do not force a restart");
await delivered.installReadyUpdate();
assert.equal(installs, previousInstalls + 1, "Explicit restart reaches the native installation command");
delivered.dispose();
console.log("PASS: produced fixture bundle reaches native ready/version and explicit install command; no real Windows installation performed");
