import assert from "node:assert/strict";
import test from "node:test";
import { createSleepTimer } from "../src/utils/sleepTimer.mjs";

function fixture() {
  let time = 1000;
  let monotonicTime = 10;
  let expired = 0;
  let state;
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key), setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  const options = { owner: "account:a", storage, now: () => time, monotonic: () => monotonicTime,
    schedule: () => 1, unschedule() {}, onChange: (value) => { state = value; }, onExpire: () => { expired += 1; } };
  return { options, advance: (amount) => { time += amount; monotonicTime += amount; }, rewind: (amount) => { time -= amount; }, state: () => state, expired: () => expired };
}

test("sleep deadline expires once and catches up after suspended timers", () => {
  const context = fixture();
  const timer = createSleepTimer(context.options);
  timer.start("15", "track-a");
  context.advance(900_000);
  assert.equal(timer.check(), true);
  assert.equal(timer.check(), false);
  assert.equal(context.expired(), 1);
  assert.equal(context.state(), null);
});

test("a clock adjustment cannot extend an active monotonic deadline", () => {
  const context = fixture();
  const timer = createSleepTimer(context.options);
  timer.start("15", "track-a");
  context.advance(900_000);
  context.rewind(600_000);
  assert.equal(timer.check(), true);
});

test("timers survive refresh only for the same owner and expired restores pause immediately", () => {
  const context = fixture();
  let timer = createSleepTimer(context.options);
  timer.start("15", "track-a");
  timer.dispose();
  context.advance(901_000);
  timer = createSleepTimer(context.options);
  assert.equal(context.expired(), 1);
  timer.start("30", "track-a");
  timer.dispose();
  createSleepTimer({ ...context.options, owner: "account:b" });
  assert.equal(context.state(), null);
});

test("end-of-track stops before queue advance; skipping cancels it and explicit Off does not pause", () => {
  const context = fixture();
  const timer = createSleepTimer(context.options);
  timer.start("track", "track-a");
  assert.equal(timer.check("track-b"), false);
  assert.equal(timer.check("track-a"), true);
  timer.start("track", "track-a");
  timer.trackChanged("track-b");
  assert.equal(context.state(), null);
  timer.start("60", "track-b");
  timer.cancel();
  context.advance(3600_000);
  assert.equal(timer.check(), false);
  assert.equal(context.expired(), 1);
});