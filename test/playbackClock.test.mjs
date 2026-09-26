import assert from "node:assert/strict";
import test from "node:test";
import { createPlaybackClockStore, publishPlaybackTick } from "../src/components/MusicPlayer/playbackClock.js";

test("playback clock publishes only meaningful snapshot changes", () => {
  const clock = createPlaybackClockStore();
  let notifications = 0;
  const unsubscribe = clock.subscribe(() => { notifications += 1; });

  clock.publish({ position: 1.2, duration: 200 });
  clock.publish({ position: 1.2, duration: 200 });
  clock.publish({ position: 1.32, duration: 200 });

  assert.equal(notifications, 2);
  assert.deepEqual(clock.read(), { position: 1.32, duration: 200 });
  unsubscribe();
});

test("playback clock clamps invalid media values", () => {
  const clock = createPlaybackClockStore({ position: 5, duration: 10 });
  clock.publish({ position: -5, duration: Number.NaN });
  assert.deepEqual(clock.read(), { position: 0, duration: 0 });
});

test("playback clock unsubscribe stops notifications", () => {
  const clock = createPlaybackClockStore();
  let notifications = 0;
  const unsubscribe = clock.subscribe(() => { notifications += 1; });
  unsubscribe();
  clock.publish({ position: 4, duration: 50 });
  assert.equal(notifications, 0);
});

test("high-frequency engine ticks publish every clock sample but throttle broad UI commits", () => {
  const clock = createPlaybackClockStore();
  let clockNotifications = 0;
  let uiCommits = 0;
  let lastUiCommitAt = 0;
  clock.subscribe(() => { clockNotifications += 1; });

  for (let index = 1; index <= 20; index += 1) {
    lastUiCommitAt = publishPlaybackTick({
      clock,
      position: index * 0.12,
      duration: 240,
      now: index * 120,
      lastUiCommitAt,
      uiIntervalMs: 450,
      commitPosition: () => { uiCommits += 1; },
    });
  }

  assert.equal(clockNotifications, 20);
  assert.ok(uiCommits > 0);
  assert.ok(uiCommits < 8, `expected fewer than 8 broad UI commits, got ${uiCommits}`);
  assert.deepEqual(clock.read(), { position: 2.4, duration: 240 });
});
