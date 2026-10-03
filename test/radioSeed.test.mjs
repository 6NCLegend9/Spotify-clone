import assert from "node:assert/strict";
import test from "node:test";
import { buildRadioDiscoveryQueries, collectRadioArtistExclusions, diversifyRadioTracks, normalizeRadioArtist, preserveRadioReplacementMetadata, retargetRadioPlaybackContext } from "../src/utils/radioSeed.mjs";

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


test("radio discovery stays anchored to the origin song instead of asking for more seed-artist songs", () => {
  const origin = {
    id: "GGGGGGGGGG1",
    title: "BigXthaPlug - 6WA (Official Visualizer)",
    channel: "BigXthaPlug",
    seedQuery: "6wa",
    genre: "Hip-Hop",
  };
  const current = {
    id: "HHHHHHHHHH1",
    title: "A Different Song (Official Music Video)",
    channel: "Different Artist",
    seedQuery: "6wa",
    genre: "Hip-Hop",
  };
  const queries = buildRadioDiscoveryQueries(current, {
    originTrack: origin,
    contextName: "6wa",
    limit: 5,
  });
  assert.ok(queries.some((query) => /6WA.*BigXthaPlug.*similar songs/i.test(query)));
  assert.ok(queries.some((query) => /Hip-Hop similar music/i.test(query)));
  assert.ok(queries.some((query) => /BigXthaPlug similar artists songs/i.test(query)));
  assert.ok(!queries.some((query) => /^BigXthaPlug (?:songs|mix)$/i.test(query)));
});

test("radio diversification can exclude artists already waiting in the queue", () => {
  const result = diversifyRadioTracks([
    track("IIIIIIIIII1", "Seed Artist", "Seed extra"),
    track("JJJJJJJJJJ1", "Queued Artist", "Queued duplicate"),
    track("KKKKKKKKKK1", "Artist K", "K one"),
    track("LLLLLLLLLL1", "Artist L", "L one"),
    track("MMMMMMMMMM1", "Artist K", "K two"),
  ], {
    seedArtist: "Seed Artist",
    excludeArtists: ["Queued Artist"],
    maxSeedArtist: 0,
    maxPerArtist: 1,
    artistGap: 4,
    limit: 10,
  });
  assert.deepEqual(result.map((item) => item.channel), ["Artist K", "Artist L"]);
});


test("radio artist exclusions carry recent listening history into the next discovery batch", () => {
  const exclusions = collectRadioArtistExclusions({
    history: [
      track("HISTORY00001", "Artist Old", "Old"),
      track("HISTORY00002", "Artist Recent A - Topic", "Recent A"),
      track("HISTORY00003", "Artist Recent B", "Recent B"),
    ],
    current: track("CURRENT00001", "Current Artist", "Current"),
    upcoming: [
      track("UPCOMING001", "Queued Artist", "Queued"),
      track("UPCOMING002", "Artist Recent A", "Duplicate artist spelling"),
    ],
    historyLimit: 2,
    upcomingLimit: 2,
  });

  assert.deepEqual(exclusions, [
    "artist recent a",
    "artist recent b",
    "current artist",
    "queued artist",
  ]);
});


test("same-song replacement preserves radio origin affinity without lying about the new uploader", () => {
  const current = {
    id: "ORIGIN00001",
    title: "Origin Song",
    channel: "Origin Artist",
    seedQuery: "deep house night drive",
    genre: "Deep House",
  };
  const replacement = {
    id: "REPLACE0001",
    title: "Origin Song (Official Audio)",
    channel: "Mirror Upload - Topic",
    seedQuery: "Origin Song official audio",
    genre: "",
  };
  const next = preserveRadioReplacementMetadata(current, replacement);
  assert.equal(next.id, replacement.id);
  assert.equal(next.channel, replacement.channel);
  assert.equal(next.seedQuery, current.seedQuery);
  assert.equal(next.genre, current.genre);
  assert.equal(next.radioSeedArtist, current.channel);
});

test("radio playback context retargets only when the replaced row is the radio origin", () => {
  const context = { type: "radio", id: "ORIGIN00001", name: "Deep House Radio" };
  assert.deepEqual(
    retargetRadioPlaybackContext(context, "ORIGIN00001", "REPLACE0001"),
    { type: "radio", id: "REPLACE0001", name: "Deep House Radio" },
  );
  assert.equal(
    retargetRadioPlaybackContext({ type: "playlist", id: "p1", name: "List" }, "ORIGIN00001", "REPLACE0001").id,
    "p1",
  );
  assert.equal(
    retargetRadioPlaybackContext(context, "OTHER000001", "REPLACE0001").id,
    "ORIGIN00001",
  );
});
