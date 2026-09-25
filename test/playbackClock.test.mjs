import assert from "node:assert/strict";
import test from "node:test";
import { createPlaybackClockStore } from "../src/components/MusicPlayer/playbackClock.js";

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
