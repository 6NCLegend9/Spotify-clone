import assert from "node:assert/strict";
import test from "node:test";
import {
  publicPulseTracks,
  recordPulsePlay,
  sanitizePulseTracks,
  shouldRecordWeekPulse,
  utcWeekKey,
} from "../src/utils/weekPulse.mjs";

test("weekly pulse keys follow ISO weeks in UTC", () => {
  assert.equal(utcWeekKey(new Date("2026-01-01T00:00:00Z")), "2026-W01");
  assert.equal(utcWeekKey(new Date("2026-09-18T21:00:00Z")), "2026-W38");
});

test("pulse aggregation is anonymous, opted-in, and capped", () => {
  const ranked = recordPulsePlay(
    [{ id: "abcdefghijk", plays: 2 }, { id: "short" }, { user: "secret", id: "bcdefghijkl", plays: 9 }],
    "abcdefghijk",
  );
  assert.deepEqual(ranked.map((track) => track.id), ["bcdefghijkl", "abcdefghijk"]);
  assert.equal(ranked[1].plays, 3);
  assert.deepEqual(publicPulseTracks(ranked), [{ id: "bcdefghijkl" }, { id: "abcdefghijk" }]);
  assert.equal(JSON.stringify(publicPulseTracks(ranked)).includes("user"), false);
  assert.equal(JSON.stringify(publicPulseTracks(ranked)).includes("plays"), false);
  assert.equal(sanitizePulseTracks([{ id: "abcdefghijk", plays: -4 }])[0].plays, 0);
});

test("pulse recording stays off without insights or completed observations", () => {
  const observation = { event: "completed", id: "abcdefghijk" };
  assert.equal(shouldRecordWeekPulse(observation, { listeningInsights: true }), true);
  assert.equal(shouldRecordWeekPulse(observation, { listeningInsights: false }), false);
  assert.equal(shouldRecordWeekPulse(observation, { listeningInsights: true, privateSession: true }), false);
  assert.equal(shouldRecordWeekPulse({ event: "skipped", id: "abcdefghijk" }, { listeningInsights: true }), false);
  assert.equal(shouldRecordWeekPulse(null, { listeningInsights: true }), false);
});
