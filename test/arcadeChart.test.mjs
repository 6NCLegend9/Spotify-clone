import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePcm,
  approachSeconds,
  beatInterval,
  buildRhythmChart,
  chartEnergy,
  clampBpm,
  estimateBpm,
  estimateBpmFromOnsets,
  hashSeed,
  notesInWindow,
  remapLanes,
} from "../src/utils/arcadeChart.mjs";

test("bpm stays in a playable range and is stable for a seed", () => {
  assert.equal(clampBpm(40), 72);
  assert.equal(clampBpm(240), 180);
  assert.equal(clampBpm("nope"), 120);
  assert.equal(estimateBpm("same-id"), estimateBpm("same-id"));
  assert.equal(estimateBpm("x", "sad acoustic ballad"), 84);
  assert.equal(estimateBpm("x", "nightcore edm mix"), 140);
});

test("rhythm charts are song-locked, monotonic, and seed-stable", () => {
  const chart = buildRhythmChart({
    duration: 30,
    bpm: 120,
    seed: "demo-track",
    lanes: 4,
  });
  assert.equal(chart.bpm, 120);
  assert.ok(chart.notes.length > 16);
  assert.equal(chart.source, "grid");
  for (let index = 1; index < chart.notes.length; index += 1) {
    assert.ok(chart.notes[index].t >= chart.notes[index - 1].t);
    assert.ok(chart.notes[index].t < 30);
    assert.ok(chart.notes[index].lane >= 0 && chart.notes[index].lane < 4);
  }
  const again = buildRhythmChart({ duration: 30, bpm: 120, seed: "demo-track", lanes: 4 });
  assert.deepEqual(again.notes, chart.notes);
  assert.notDeepEqual(
    buildRhythmChart({ duration: 30, bpm: 120, seed: "other-track", lanes: 4 }).notes,
    chart.notes,
  );
});

test("onset charts keep detected times and remap lanes without dropping notes", () => {
  const onsets = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5];
  const chart = buildRhythmChart({
    duration: 8,
    bpm: 120,
    seed: "onsets",
    lanes: 4,
    onsets,
  });
  assert.equal(chart.source, "onsets");
  assert.ok(chart.notes.length >= 8);
  const three = remapLanes(chart, 3);
  assert.equal(three.notes.length, chart.notes.length);
  assert.ok(three.notes.every((note) => note.lane >= 0 && note.lane < 3));
});

test("windowing, energy pulses, and approach time stay on the beat", () => {
  const notes = [{ t: 1 }, { t: 2 }, { t: 3 }];
  assert.deepEqual(notesInWindow(notes, 1.5, 2.5).map((note) => note.t), [2]);
  const energy = chartEnergy(0, 120);
  assert.ok(energy.onset);
  assert.ok(energy.bass > 0.8);
  assert.equal(approachSeconds(120, 4), 2);
  assert.equal(beatInterval(120), 0.5);
});

test("PCM analysis recovers a 120 BPM pulse train", () => {
  const sampleRate = 8000;
  const bpm = 120;
  const samples = new Float32Array(sampleRate * 6);
  const interval = Math.round((60 / bpm) * sampleRate);
  for (let beat = 0; beat < 12; beat += 1) {
    const start = beat * interval;
    for (let index = 0; index < 80 && start + index < samples.length; index += 1) {
      samples[start + index] = 1;
    }
  }
  const analysis = analyzePcm(samples, sampleRate);
  assert.ok(analysis.onsets.length >= 6);
  const detected = estimateBpmFromOnsets(analysis.onsets);
  assert.ok(Math.abs(detected - 120) <= 8);
  assert.equal(hashSeed("a"), hashSeed("a"));
  assert.notEqual(hashSeed("a"), hashSeed("b"));
});
