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
    /filters\[filters\.length - 1\]\.connect\(preamp\);[\s\S]*preamp\.connect\(compressor\);/,
  );
  assert.match(hook, /graph = \{[^}]*compressor[^}]*\}/s);
  assert.match(hook, /graph\.compressor\.disconnect\(\);/);
  assert.match(hook, /graph\.compressor\.connect\(graph\.splitter\);/);
});


test("native EQ applies preamp headroom before the safety limiter in the graph", async () => {
  const hook = await read("src/hooks/useAudioEq.js");
  const filterToPreamp = hook.indexOf("filters[filters.length - 1].connect(preamp)");
  const preampToLimiter = hook.indexOf("preamp.connect(compressor)");
  const limiterToOutput = hook.indexOf("compressor.connect(splitter)");

  assert.ok(filterToPreamp >= 0, "EQ filters should feed a preamp node");
  assert.ok(preampToLimiter > filterToPreamp, "preamp attenuation should happen before the limiter");
  assert.ok(limiterToOutput > preampToLimiter, "limiter should feed the output routing");
});

test("YouTube playback does not call unsupported quality forcing APIs", async () => {
  const player = await read("src/components/MusicPlayer/YouTubePlayer.jsx");

  assert.doesNotMatch(player, /setPlaybackQuality/);
  assert.doesNotMatch(player, /getPlaybackQuality/);
  assert.doesNotMatch(player, /\bvq:\s*/);
  assert.doesNotMatch(player, /requestYouTubeQuality/);
  assert.match(player, /onPlaybackQualityChange/);
});

test("audio settings describe real controls instead of unsupported quality or LUFS claims", async () => {
  const settings = await read("src/app/settings/page.jsx");

  assert.doesNotMatch(settings, /Audio quality preference/);
  assert.doesNotMatch(settings, /Video quality preference/);
  assert.doesNotMatch(settings, /LUFS/);
  assert.doesNotMatch(settings, /asks YouTube for the selected quality/);
  assert.match(settings, /Playback level/);
  assert.match(settings, /YouTube chooses stream quality automatically/);
});

test("native audio does not fake stereo widening by panning the whole mix", async () => {
  const [hook, settings] = await Promise.all([
    read("src/hooks/useAudioEq.js"),
    read("src/app/settings/page.jsx"),
  ]);

  assert.doesNotMatch(hook, /createStereoPanner/);
  assert.doesNotMatch(settings, /Spatial audio \/ Stereo expansion/);
});


test("native and YouTube playback share one master-volume authority", async () => {
  const [shell, player] = await Promise.all([
    read("src/components/MusicPlayer/index.jsx"),
    read("src/components/MusicPlayer/Player.jsx"),
  ]);

  assert.doesNotMatch(shell, /const \[volume, setVolume\] = useState\(/);
  assert.doesNotMatch(shell, /volume=\{volume\}/);
  assert.doesNotMatch(player, /volume\s*\*\s*\(Number\.isFinite\(masterVolume\)/);
  assert.match(
    player,
    /ref\.current\.volume\s*=\s*Number\.isFinite\(masterVolume\)\s*\?\s*masterVolume\s*:\s*1/,
  );
});
