import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EQ_BAND_FREQS, EQ_PRESET_BANDS, applyLatestOutputVolume, armVolumeRestore, bandsForPreset, migrateEqBands, playerOutputVolume } from "../src/utils/eqPresets.js";
test("equalizer exposes six frequency bands", () => {
  assert.deepEqual(EQ_BAND_FREQS, [60, 150, 400, 1000, 2400, 15000]);
  for (const bands of Object.values(EQ_PRESET_BANDS)) {
    assert.equal(bands.length, 6);
    assert.ok(bands.every((gain) => Number.isFinite(gain) && gain >= -12 && gain <= 12));
  }
});
test("legacy five-band curves migrate deterministically", () => {
  const migrated = migrateEqBands([8, 4, 0, -4, -8]);
  assert.equal(migrated.length, 6);
  assert.equal(migrated[0], 8);
  assert.equal(migrated[5], -8);
  assert.deepEqual(migrateEqBands(migrated), migrated);
  assert.deepEqual(bandsForPreset("Custom", [0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0]);
});
test("player output volume stays on the user's master level", () => {
  assert.equal(playerOutputVolume(100, 1), 100);
  assert.equal(playerOutputVolume(100, 0.2), 20);
  assert.equal(playerOutputVolume(100, 0), 0);
  assert.equal(playerOutputVolume(80, 0.5, 0), 0);
  assert.equal(playerOutputVolume(100, Number.NaN), 100);
});
test("a tab-return listener applies the latest volume instead of the level captured at startup", () => {
  const levels = { playbackVolume: 100, masterVolume: 1 };
  const calls = [];
  const player = { setVolume: (value) => calls.push(value) };
  const onVisible = () => applyLatestOutputVolume(player, levels);
  levels.masterVolume = 0.2;
  onVisible();
  assert.deepEqual(calls, [20]);
});

test("volume restore writes the latest level again after YouTube snaps back to 100", () => {
  const levels = { playbackVolume: 100, masterVolume: 0.25 };
  const calls = [];
  const timers = [];
  const player = { setVolume: (value) => calls.push(value) };
  armVolumeRestore({
    apply: () => applyLatestOutputVolume(player, levels),
    delays: [100, 400],
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return ms;
    },
    clearTimer: () => {},
  });
  assert.deepEqual(calls, [25]);
  player.setVolume(100);
  timers.find((timer) => timer.ms === 400).fn();
  assert.equal(calls.at(-1), 25);
});

test("volume restore stays quiet while hidden and cancels when the tab leaves", () => {
  let allowed = false;
  const calls = [];
  const timers = [];
  const cleared = [];
  const handle = armVolumeRestore({
    apply: () => calls.push("apply"),
    shouldApply: () => allowed,
    delays: [100, 300],
    setTimer: (fn, ms) => {
      timers.push(fn);
      return ms;
    },
    clearTimer: (id) => cleared.push(id),
  });
  assert.deepEqual(calls, []);
  handle.clear();
  assert.deepEqual(cleared, [300, 100]);
  allowed = true;
  timers[0]();
  assert.deepEqual(calls, []);
});

test("volume restore window stays open until the last reapply", () => {
  let clock = 1_000;
  const handle = armVolumeRestore({
    apply: () => {},
    delays: [100, 4500],
    now: () => clock,
    setTimer: () => 1,
    clearTimer: () => {},
  });
  assert.equal(handle.holds(), true);
  clock = 5_499;
  assert.equal(handle.holds(), true);
  clock = 5_500;
  assert.equal(handle.holds(), false);
});

test("the YouTube tab listener reads the live master volume", async () => {
  const player = await readFile(new URL("../src/components/MusicPlayer/YouTubePlayer.jsx", import.meta.url), "utf8");
  assert.match(player, /volumeLevelsRef\.current = \{ playbackVolume, masterVolume \}/);
  assert.match(player, /applyLatestOutputVolume\(player, volumeLevelsRef\.current/);
  assert.match(player, /armVolumeRestore\(/);
  assert.doesNotMatch(player, /Math\.round\(playbackVolume \* master \* ratio\)/);
});
