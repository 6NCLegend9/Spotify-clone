import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTrackCut,
  preferredTrackCut,
  rankTrackCutResults,
  TRACK_CUT_STORAGE_KEY,
  writeTrackCutPreference,
} from "../src/utils/trackCut.mjs";

test("classifies official, live, and sped-up uploads", () => {
  assert.equal(classifyTrackCut({ title: "Brand New Dance (Official Audio)" }), "official");
  assert.equal(classifyTrackCut({ title: "Jhene Aiko brings out Omarion for Post To Be" }), "live");
  assert.equal(classifyTrackCut({ title: "Brand New Dance (Sped Up)" }), "speed");
});

test("ranks the matching cut ahead of covers and other versions", () => {
  const query = "Eminem Brand New Dance";
  const official = { title: "Brand New Dance (Official Music Video)", channel: "EminemVEVO" };
  const live = { title: "Brand New Dance Live", channel: "EminemVEVO" };
  const speed = { title: "Brand New Dance Sped Up", channel: "Nightcore Channel" };
  const cover = { title: "Brand New Dance cover", channel: "Random Covers" };
  assert.equal(rankTrackCutResults([cover, live, official, speed], "official", query)[0], official);
  assert.equal(rankTrackCutResults([cover, official, speed, live], "live", query)[0], live);
  assert.equal(rankTrackCutResults([cover, official, live, speed], "speed", query)[0], speed);
});

test("remembers the preferred cut per song identity", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  const track = { title: "Eminem - Brand New Dance", channel: "EminemMusic" };
  writeTrackCutPreference(storage, "eminem|brand new dance", "live");
  assert.equal(preferredTrackCut(track, storage), "live");
  assert.equal(JSON.parse(store.get(TRACK_CUT_STORAGE_KEY))["eminem|brand new dance"], "live");
});
