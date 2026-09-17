import assert from "node:assert/strict";
import test from "node:test";
import { semanticVersionParts, versionOlderThan } from "../src/updater.mjs";

test("desktop updater compares semantic versions for mandatory upgrades", () => {
  assert.deepEqual(semanticVersionParts("1.2.3"), [1, 2, 3]);
  assert.deepEqual(semanticVersionParts("2.0.0-beta.1"), [2, 0, 0]);
  assert.equal(semanticVersionParts("not-a-version"), null);

  assert.equal(versionOlderThan("1.0.0", "1.0.1"), true);
  assert.equal(versionOlderThan("1.9.9", "2.0.0"), true);
  assert.equal(versionOlderThan("2.0.0", "2.0.0"), false);
  assert.equal(versionOlderThan("2.1.0", "2.0.9"), false);
});
