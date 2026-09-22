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

test("leaving a Jam keeps the final Jam track paused instead of restoring stale playback", () => {
  assert.match(persistenceSource, /const leavingJam = wasInJam\.current && !inJam/);
  assert.match(
    persistenceSource,
    /if \(leavingJam\) \{[\s\S]*store\.dispatch\(playPause\(false\)\)[\s\S]*writePlaybackSnapshot\(storage, owner, finalJamPlayback\)[\s\S]*\} else \{[\s\S]*restorePlayback/,
  );
});

test("settings provides separate current-device and all-device sign-out actions", () => {
  assert.match(settingsSource, /"Sign out this device"/);
  assert.match(settingsSource, /> Sign out all devices/);
  assert.match(settingsSource, /onClick=\{signOutThisDevice\}/);
});
