import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as eqPresets from "../src/utils/eqPresets.js";

const {
  EQ_PRESET_BANDS,
  normalizationGain,
  youtubePlaybackVolume,
} = eqPresets;
import { rankOfficialMusicResults } from "../src/utils/officialMusicSearch.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("normal playback level is unity instead of attenuating every track", () => {
  assert.equal(normalizationGain("normal"), 1);
});

test("YouTube playback level does not fake EQ by changing whole-track volume", () => {
  const flat = youtubePlaybackVolume(EQ_PRESET_BANDS["Flat / Neutral"], "normal");
  const bass = youtubePlaybackVolume(EQ_PRESET_BANDS["Bass Boost"], "normal");
  const vocals = youtubePlaybackVolume(EQ_PRESET_BANDS["Vocal Booster"], "normal");

  assert.equal(flat, 100);
  assert.equal(bass, flat);
  assert.equal(vocals, flat);
});

test("new listeners start at full master volume in web and persisted account defaults", async () => {
  const [settings, model] = await Promise.all([
    read("src/redux/features/settingsSlice.js"),
    read("src/models/UserData.js"),
  ]);

  assert.match(settings, /masterVolume:\s*1(?:\.0)?\s*,/);
  assert.match(model, /masterVolume:\s*\{[^}]*default:\s*1(?:\.0)?\b[^}]*\}/s);
});

test("native DSP configures the compressor as a peak limiter instead of using aggressive browser defaults", async () => {
  const hook = await read("src/hooks/useAudioEq.js");

  assert.match(hook, /compressor\.threshold\.value\s*=\s*-1\b/);
  assert.match(hook, /compressor\.knee\.value\s*=\s*0\b/);
  assert.match(hook, /compressor\.ratio\.value\s*=\s*20\b/);
  assert.match(hook, /compressor\.attack\.value\s*=\s*0\.003\b/);
  assert.match(hook, /compressor\.release\.value\s*=\s*0\.08\b/);
});

test("plain song searches prefer official master audio over a music-video upload when relevance is equal", () => {
  const results = [
    {
      id: "video000001",
      title: "Example Song (Official Music Video)",
      channel: "ExampleVEVO",
    },
    {
      id: "audio000001",
      title: "Example Song",
      channel: "Example - Topic",
    },
  ];

  const ranked = rankOfficialMusicResults(results, "Example Song");
  assert.equal(ranked[0]?.id, "audio000001");
});

test("explicit video searches still prefer the official music video", () => {
  const results = [
    {
      id: "video000001",
      title: "Example Song (Official Music Video)",
      channel: "ExampleVEVO",
    },
    {
      id: "audio000001",
      title: "Example Song",
      channel: "Example - Topic",
    },
  ];

  const ranked = rankOfficialMusicResults(results, "Example Song video");
  assert.equal(ranked[0]?.id, "video000001");
});


test("positive native EQ boosts reserve preamp headroom before the limiter", () => {
  assert.equal(typeof eqPresets.eqHeadroomGain, "function");
  assert.equal(eqPresets.eqHeadroomGain([0, 0, 0, 0, 0, 0]), 1);
  assert.ok(Math.abs(eqPresets.eqHeadroomGain([6, 0, 0, 0, 0, 0]) - (10 ** (-6 / 20))) < 0.005);
  assert.ok(Math.abs(eqPresets.eqHeadroomGain([8, 5, 0, 0, 0, 0]) - (10 ** (-8 / 20))) < 0.005);
});

test("native EQ applies headroom before its safety limiter", async () => {
  const hook = await read("src/hooks/useAudioEq.js");
  assert.match(hook, /normalizationGain\(normalization\)\s*\*\s*eqHeadroomGain\(bands\)/);
});


test("native EQ preamp is placed before the peak limiter in the signal graph", async () => {
  const hook = await read("src/hooks/useAudioEq.js");
  assert.match(
    hook,
    /filters\[filters\.length - 1\]\.connect\(gain\);[\s\S]*gain\.connect\(compressor\);/,
  );
  assert.match(hook, /graph = \{[^}]*compressor[^}]*\}/s);
  assert.match(hook, /graph\.compressor\.disconnect\(\);/);
  assert.match(hook, /graph\.compressor\.connect\(graph\.splitter\);/);
});
