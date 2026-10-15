import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { resolveReleaseMetadata } from "./resolve-release-metadata.mjs";

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
const listeners = new Map(), statuses = [];
const engine = {
  on: (name, callback) => listeners.set(name, callback),
  setFeedURL: value => { feed = value; },
  checkForUpdates: async () => {
    checkCount++;
    listeners.get("update-available")({ version: automatic.version });
    listeners.get("download-progress")({ percent: 50 });
    listeners.get("update-downloaded")({ version: automatic.version });
  },
  quitAndInstall: () => { installs++; },
};
let updaterCode = fs.readFileSync(new URL("../src/updater.mjs", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, "")
  .replace("export class DesktopUpdater", "globalThis.DesktopUpdater = class DesktopUpdater");
const sandbox = {
  updaterPackage: { autoUpdater: engine }, DESKTOP_API_VERSION: 1, DESKTOP_BUILD_CHANNEL: "stable",
  UPDATE_FEED_BASE_URL: "https://haykasa.vercel.app/api/desktop/update",
  UPDATE_MANIFEST_URL: "https://haykasa.vercel.app/api/desktop/manifest", UPDATE_PREFLIGHT_TIMEOUT_MS: 1000,
  UPDATE_CHECK_INTERVAL_MS: 1000, UPDATE_INITIAL_DELAY_JITTER_MS: 0, UPDATE_INITIAL_DELAY_MIN_MS: 0,
  effectiveUpdateChannel: () => "stable", installationEligibleForRollout: () => true,
  versionOlderThan: () => false, URL, AbortSignal, process: { env: {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  fetch: async () => ({ ok: true, json: async () => ({
    channel: "stable", latest: automatic.version, minimum: automatic.minimum_version,
    published: true, signed: true, downloadUrl: "https://example.invalid/HayKasa.exe",
    sha512: "a".repeat(86) + "==", sizeBytes: 100,
  }) }),
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
console.log("PASS: automatic stable versioning, preserved manual channels, invalid metadata, updater discovery/download/restart states and Windows notification");
