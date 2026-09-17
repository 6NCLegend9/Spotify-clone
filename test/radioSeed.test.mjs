import assert from "node:assert/strict";
import test from "node:test";
import { diversifyRadioTracks, normalizeRadioArtist } from "../src/utils/radioSeed.mjs";

const track = (id, channel, title) => ({ id, channel, title });

test("radio diversification caps repeated artists while keeping one seed-artist song valid", () => {
  const input = [
    track("AAAAAAAAAA1", "Seed Artist - Topic", "Seed one"),
    track("AAAAAAAAAA2", "Seed Artist", "Seed two"),
    track("BBBBBBBBBB1", "Artist B", "B one"),
    track("BBBBBBBBBB2", "Artist B", "B two"),
    track("BBBBBBBBBB3", "Artist B", "B three"),
    track("CCCCCCCCCC1", "Artist C", "C one"),
    track("DDDDDDDDDD1", "Artist D", "D one"),
  ];

  const result = diversifyRadioTracks(input, {
    seedArtist: "Seed Artist",
    limit: 10,
    maxPerArtist: 2,
    maxSeedArtist: 1,
    artistGap: 2,
  });

  const counts = new Map();
  result.forEach((item) => {
    const artist = normalizeRadioArtist(item.channel);
    counts.set(artist, (counts.get(artist) || 0) + 1);
  });

  assert.equal(counts.get("seed artist"), 1);
  assert.equal(counts.get("artist b"), 2);
  assert.equal(result.length, 5);
  for (let index = 1; index < result.length; index += 1) {
    assert.notEqual(
      normalizeRadioArtist(result[index - 1].channel),
      normalizeRadioArtist(result[index].channel),
    );
  }
});

test("radio diversification removes duplicate video IDs without treating an artist as a duplicate song", () => {
  const duplicate = track("EEEEEEEEEE1", "Artist E", "First");
  const result = diversifyRadioTracks([
    duplicate,
    { ...duplicate, title: "Duplicate row" },
    track("EEEEEEEEEE2", "Artist E", "Second song"),
    track("FFFFFFFFFF1", "Artist F", "Other artist"),
  ], { maxPerArtist: 2, artistGap: 1 });

  assert.deepEqual(result.map((item) => item.id).sort(), [
    "EEEEEEEEEE1",
    "EEEEEEEEEE2",
    "FFFFFFFFFF1",
  ].sort());
});
