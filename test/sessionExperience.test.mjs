import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const persistenceSource = readFileSync(
  new URL("../src/components/PlaybackPersistence.jsx", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(
  new URL("../src/app/settings/page.jsx", import.meta.url),
  "utf8",
);

test("entering a Jam freezes the listener queue; leaving restores that pre-Jam snapshot", () => {
  assert.match(persistenceSource, /const leavingJam = wasInJam\.current && !inJam/);
  assert.match(persistenceSource, /const enteringJam = !wasInJam\.current && inJam/);
  assert.match(persistenceSource, /preJamOwner/);
  assert.match(persistenceSource, /if \(enteringJam && owner && storage\)/);
  assert.match(persistenceSource, /writePlaybackSnapshot\(storage, preJamOwner\(owner\), store\.getState\(\)\.player\)/);
  assert.match(persistenceSource, /restorePlayback\(\{ owner, snapshot: preJam \}\)/);
  assert.doesNotMatch(persistenceSource, /writePlaybackSnapshot\(storage, owner, finalJamPlayback\)/);
});

test("settings provides separate current-device and all-device sign-out actions", () => {
  assert.match(settingsSource, /"Sign out this device"/);
  assert.match(settingsSource, /> Sign out all devices/);
  assert.match(settingsSource, /onClick=\{signOutThisDevice\}/);
});
