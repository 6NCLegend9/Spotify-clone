import assert from "node:assert/strict";
import test from "node:test";
import {
  DISCOVERY_SHUFFLE_STORAGE_KEY,
  readDiscoveryShufflePreference,
  writeDiscoveryShufflePreference,
} from "../src/utils/discoveryShufflePreference.mjs";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
}

test("discovery preference reads the canonical key and legacy autoAdd fallback", () => {
  assert.equal(readDiscoveryShufflePreference(memoryStorage({ [DISCOVERY_SHUFFLE_STORAGE_KEY]: "true" })), true);
  assert.equal(readDiscoveryShufflePreference(memoryStorage({ [DISCOVERY_SHUFFLE_STORAGE_KEY]: "false", autoAdd: "true" })), false);
  assert.equal(readDiscoveryShufflePreference(memoryStorage({ autoAdd: "true" })), true);
  assert.equal(readDiscoveryShufflePreference(memoryStorage()), false);
});

test("writing discovery preference canonicalizes storage and removes the legacy owner", () => {
  const storage = memoryStorage({ autoAdd: "true" });
  assert.equal(writeDiscoveryShufflePreference(storage, false), true);
  assert.deepEqual(storage.snapshot(), { [DISCOVERY_SHUFFLE_STORAGE_KEY]: "false" });
});

test("blocked storage fails closed without breaking playback state", () => {
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.equal(readDiscoveryShufflePreference(storage), false);
  assert.equal(writeDiscoveryShufflePreference(storage, true), false);
});
