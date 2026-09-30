import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CRASH_WINDOW_MS,
  NativeStore,
  SAFE_MODE_THRESHOLD,
  STORE_VERSION,
} from "../src/nativeStore.mjs";

test("desktop settings default safely and persist supported values", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heykasa-desktop-store-"));
  try {
    const store = new NativeStore(directory);
    assert.equal(store.get("version"), STORE_VERSION);
    assert.match(store.get("installationId"), /^[0-9a-f-]{36}$/i);
    assert.equal(store.get("autoLaunch"), false);
    assert.equal(store.get("autoUpdate"), true);
    assert.equal(store.get("closeToTray"), true);
    assert.equal(store.get("updateChannel"), "stable");
    assert.equal(store.get("safeMode"), false);
    assert.equal(store.get("rendererCacheSchema"), 0);

    const installationId = store.get("installationId");
    store.set("autoLaunch", true);
    store.set("closeToTray", false);
    store.set("updateChannel", "beta");
    store.set("rendererCacheSchema", 1);

    const restored = new NativeStore(directory);
    assert.equal(restored.get("installationId"), installationId);
    assert.equal(restored.get("autoLaunch"), true);
    assert.equal(restored.get("closeToTray"), false);
    assert.equal(restored.get("updateChannel"), "beta");
    assert.equal(restored.get("autoUpdate"), true);
    assert.equal(restored.get("rendererCacheSchema"), 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("desktop settings sanitize corrupted and unsupported values", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heykasa-desktop-store-"));
  try {
    fs.writeFileSync(path.join(directory, "desktop-settings.json"), JSON.stringify({
      version: 999,
      installationId: "not-a-uuid",
      autoLaunch: "yes",
      autoUpdate: 0,
      closeToTray: "sometimes",
      updateChannel: "nightly",
      lastNotifiedVersion: "x".repeat(100),
      crashStreak: -10,
      safeMode: "yes",
      unexpected: "secret",
    }));

    const store = new NativeStore(directory);
    assert.match(store.get("installationId"), /^[0-9a-f-]{36}$/i);
    assert.equal(store.get("autoLaunch"), false);
    assert.equal(store.get("autoUpdate"), true);
    assert.equal(store.get("closeToTray"), true);
    assert.equal(store.get("updateChannel"), "stable");
    assert.equal(store.get("lastNotifiedVersion").length, 40);
    assert.equal(store.get("crashStreak"), 0);
    assert.equal(store.get("safeMode"), false);
    assert.equal("unexpected" in store.getAll(), false);
    assert.throws(() => store.set("unexpected", true), /Unsupported desktop setting/);
    assert.throws(() => store.set("installationId", "replacement"), /Unsupported desktop setting/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("repeated unclean starts enter safe mode and a clean exit recovers", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heykasa-desktop-store-"));
  try {
    const store = new NativeStore(directory);
    let now = 1_000_000;
    store.recordStart(now);

    for (let index = 0; index < SAFE_MODE_THRESHOLD; index += 1) {
      now += Math.floor(CRASH_WINDOW_MS / 10);
      const restarted = new NativeStore(directory);
      const state = restarted.recordStart(now);
      if (index < SAFE_MODE_THRESHOLD - 1) assert.equal(state.safeMode, false);
      else assert.equal(state.safeMode, true);
    }

    const safeStore = new NativeStore(directory);
    assert.equal(safeStore.get("safeMode"), true);
    safeStore.recordCleanExit(now + 1000);
    const recovered = new NativeStore(directory);
    assert.equal(recovered.get("safeMode"), false);
    assert.equal(recovered.get("crashStreak"), 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("three renderer crashes enter safe mode in the current installation", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heykasa-desktop-store-"));
  try {
    const store = new NativeStore(directory);
    for (let index = 0; index < SAFE_MODE_THRESHOLD; index += 1) store.recordRendererCrash();
    assert.equal(store.get("safeMode"), true);
    assert.equal(store.get("rendererCrashCount"), SAFE_MODE_THRESHOLD);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
