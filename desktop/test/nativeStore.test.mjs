import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NativeStore, STORE_VERSION } from "../src/nativeStore.mjs";

test("desktop settings default safely and persist supported values", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heykasa-desktop-store-"));
  try {
    const store = new NativeStore(directory);
    assert.deepEqual(store.getAll(), {
      version: STORE_VERSION,
      autoLaunch: false,
      autoUpdate: true,
      closeToTray: true,
      updateChannel: "stable",
      lastNotifiedVersion: "",
    });

    store.set("autoLaunch", true);
    store.set("closeToTray", false);
    store.set("updateChannel", "beta");

    const restored = new NativeStore(directory);
    assert.equal(restored.get("autoLaunch"), true);
    assert.equal(restored.get("closeToTray"), false);
    assert.equal(restored.get("updateChannel"), "beta");
    assert.equal(restored.get("autoUpdate"), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("desktop settings sanitize corrupted and unsupported values", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heykasa-desktop-store-"));
  try {
    fs.writeFileSync(path.join(directory, "desktop-settings.json"), JSON.stringify({
      version: 999,
      autoLaunch: "yes",
      autoUpdate: 0,
      closeToTray: "sometimes",
      updateChannel: "nightly",
      lastNotifiedVersion: "x".repeat(100),
      unexpected: "secret",
    }));

    const store = new NativeStore(directory);
    assert.equal(store.get("autoLaunch"), false);
    assert.equal(store.get("autoUpdate"), true);
    assert.equal(store.get("closeToTray"), true);
    assert.equal(store.get("updateChannel"), "stable");
    assert.equal(store.get("lastNotifiedVersion").length, 40);
    assert.equal("unexpected" in store.getAll(), false);
    assert.throws(() => store.set("unexpected", true), /Unsupported desktop setting/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
