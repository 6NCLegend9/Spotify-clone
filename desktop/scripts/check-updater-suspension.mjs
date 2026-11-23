import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { test } from "node:test";
import { compareReleaseVersions, versionOlderThan } from "../src/version.mjs";
const require = createRequire(import.meta.url);
const { BaseUpdater } = require("electron-updater/out/BaseUpdater.js");

const source = fs.readFileSync(new URL("../src/updater.mjs", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?from ["'][^"']+["'];\r?\n/gm, "")
  .replace("export class DesktopUpdater", "globalThis.DesktopUpdater = class DesktopUpdater");

function harness() {
  let autoUpdate = true, requests = 0, installs = 0, resolveManifest, rejectManifest, onQuit;
  const listeners = new Map();
  const engine = {
    on: (event, callback) => listeners.set(event, callback), setFeedURL() {},
    checkForUpdates: async () => { requests++; }, quitAndInstall: () => { installs++; },
    app: { onQuit: callback => { onQuit = callback; } },
    _logger: { info() {} }, install: () => { installs++; },
    addQuitHandler: BaseUpdater.prototype.addQuitHandler,
  };
  const manifest = { channel: "stable", published: true, signed: true,
    downloadUrl: "https://example.invalid/update.exe", latest: "1.2.0", minimum: "1.0.0",
    sha512: "a".repeat(86) + "==", sizeBytes: 100 };
  const context = vm.createContext({
    updaterPackage: { autoUpdater: engine }, DESKTOP_BUILD_CHANNEL: "stable", DESKTOP_API_VERSION: 1,
    UPDATE_FEED_BASE_URL: "https://example.invalid/update", UPDATE_MANIFEST_URL: "https://example.invalid/manifest",
    UPDATE_PREFLIGHT_TIMEOUT_MS: 1000, UPDATE_CHECK_INTERVAL_MS: 1000,
    UPDATE_INITIAL_DELAY_JITTER_MS: 0, UPDATE_INITIAL_DELAY_MIN_MS: 0,
    effectiveUpdateChannel: () => "stable", installationEligibleForRollout: () => true,
    compareReleaseVersions, versionOlderThan, URL, AbortSignal, process: { env: {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 2, clearInterval() {},
    fetch: () => new Promise((resolve, reject) => {
      resolveManifest = () => resolve({ ok: true, json: async () => manifest });
      rejectManifest = () => reject(new Error("Retired network failure"));
    }),
  });
  vm.runInContext(source, context);
  const updater = new context.DesktopUpdater({ app: { isPackaged: true, getVersion: () => "1.1.0" },
    store: { get: key => key === "autoUpdate" ? autoUpdate : undefined } });
  return { updater, engine, listeners, get requests() { return requests; }, get installs() { return installs; },
    quit: () => onQuit?.(0),
    release: () => resolveManifest(), reject: () => rejectManifest(),
    setAutomatic: value => { autoUpdate = value; updater.preferencesChanged(); } };
}

test("policy suspension disables install-on-quit even after a late download", async () => {
  const h = harness(); h.updater.start();
  h.listeners.get("update-downloaded")({ version: "1.2.0" });
  h.updater.dispose();
  assert.equal(h.engine.autoInstallOnAppQuit, false);
  h.listeners.get("update-downloaded")({ version: "1.2.0" });
  assert.equal(h.engine.autoInstallOnAppQuit, false);
  await assert.rejects(h.updater.installReadyUpdate(), /disabled|suspended/i);
  assert.equal(h.installs, 0);
});

test("suspending during manifest fetch prevents a subsequent download", async () => {
  const h = harness(); h.updater.start();
  const pending = h.updater.checkNow();
  await new Promise(setImmediate);
  h.updater.dispose(); h.release(); await pending;
  assert.equal(h.requests, 0);
});

test("opt-out remains authoritative on quit while explicit Restart stays available", async () => {
  const h = harness(); h.updater.start();
  h.listeners.get("update-downloaded")({ version: "1.2.0" });
  h.setAutomatic(false);
  assert.equal(h.engine.autoInstallOnAppQuit, false);
  await h.updater.installReadyUpdate();
  assert.equal(h.installs, 1);
});

test("ordinary shutdown preserves allowed auto-install, suspension survives shutdown", () => {
  const h = harness(); h.updater.start();
  h.updater.dispose({ shutdown: true });
  assert.equal(h.engine.autoInstallOnAppQuit, true);
  h.updater.dispose(); h.updater.dispose({ shutdown: true });
  assert.equal(h.engine.autoInstallOnAppQuit, false);
  h.updater.start();
  assert.equal(h.engine.autoInstallOnAppQuit, true);
});

test("real electron-updater quit hook honors suspension and can be enabled after download", () => {
  const h = harness(); h.updater.start(); h.setAutomatic(false);
  h.listeners.get("update-downloaded")({ version: "1.2.0" });
  h.engine.addQuitHandler(); // Actual library sequence: event, then hook registration.
  h.quit(); assert.equal(h.installs, 0);
  h.setAutomatic(true);
  h.updater.dispose({ shutdown: true });
  h.quit(); assert.equal(h.installs, 1);
  h.updater.dispose();
  h.quit(); assert.equal(h.installs, 1, "Revocation also governs an already-registered hook");
});

test("reenabling policy does not revive a superseded manifest request", async () => {
  const h = harness(); h.updater.start();
  const pending = h.updater.checkNow(); await new Promise(setImmediate);
  h.updater.dispose(); h.updater.start(); h.release(); await pending;
  assert.equal(h.requests, 0);
});

test("a retired manifest rejection cannot overwrite the current update status", async () => {
  const h = harness(); h.updater.start();
  const pending = h.updater.checkNow(); await new Promise(setImmediate);
  h.updater.dispose(); h.updater.start(); h.setAutomatic(false);
  const current = h.updater.getStatus();
  h.reject(); await pending;
  assert.deepEqual(h.updater.getStatus(), current);
});

test("manual check after reenable runs a fresh check instead of joining a retired one", async () => {
  const h = harness(); h.updater.start();
  const retired = h.updater.checkNow(); await new Promise(setImmediate);
  h.updater.dispose(); h.updater.start(); h.setAutomatic(false);
  const manual = h.updater.checkNow({ manual: true });
  h.release(); await retired; await new Promise(setImmediate);
  h.release(); await manual;
  assert.equal(h.requests, 1, "The explicit request must perform one fresh eligible check");
});

test("another policy suspension cancels a queued manual retry", async () => {
  const h = harness(); h.updater.start();
  const retired = h.updater.checkNow(); await new Promise(setImmediate);
  h.updater.dispose(); h.updater.start();
  const manual = h.updater.checkNow({ manual: true });
  h.updater.dispose(); h.updater.start();
  h.release(); await Promise.all([retired, manual]);
  assert.equal(h.requests, 0);
});
