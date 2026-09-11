import assert from "node:assert/strict";
import test from "node:test";
import { createListeningObservation, insightEvent, listeningSummary, retainedListeningEvents } from "../src/utils/listeningInsights.mjs";

test("observed playback excludes seeks, pauses, stalls and suspended sampling gaps", () => {
  let time = 0;
  const observation = createListeningObservation({ id: "abcdefghijk", eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", now: () => 1000 + time, monotonic: () => time });
  observation.sample(0, true);
  time += 1000; observation.sample(1, true);
  time += 1000; observation.sample(50, true);
  time += 1000; observation.sample(51, true);
  time += 1000; observation.sample(51, false);
  time += 1000; observation.sample(51, true);
  time += 60000; observation.sample(111, true);
  time += 1000; observation.sample(112, true);
  const event = observation.finish("completed");
  assert.equal(event.listenedSeconds, 3);
  assert.equal(observation.finish("skipped"), null);
});

test("insights validate events and only summarize retained observations, never old unique IDs", () => {
  const now = 40 * 86400_000;
  const event = insightEvent({ id: "abcdefghijk", eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", event: "completed", startedAt: now - 10_000, listenedSeconds: 999 }, now);
  assert.equal(event.listenedSeconds, 10);
  const events = ["legacy-id", { ...event, endedAt: now - 31 * 86400_000 }, event];
  assert.deepEqual(retainedListeningEvents(events, now), [event]);
  assert.equal(listeningSummary(events, 7, now).seconds, 10);
  assert.equal(listeningSummary(events, 7, now).sessions, 1);
  assert.throws(() => insightEvent({ ...event, startedAt: now + 1 }, now), { code: "VALIDATION_ERROR" });
});