import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { canonicalSongIdentity, canonicalSongTitle, sameRadioSongFamily } from "../src/utils/songIdentity.mjs";

register("./support/toolkit-loader.mjs", import.meta.url);
const {
  default: reducer,
  addToQueue,
  appendToQueue,
  replaceCurrentYoutubeTrack,
  setYoutubeVideo,
  startYoutubePlayback,
} = await import("../src/redux/features/playerSlice.js");

const seed = {
  id: "seedtrack01",
  title: "Don Toliver - Lose My Mind (feat. Doja Cat) [From F1 The Movie] [Official Music Video]",
  channel: "Don Toliver",
};

const variants = [
  { id: "variant0001", title: "Lose My Mind (feat. Doja Cat)", channel: "Don Toliver - Topic" },
  { id: "variant0002", title: "Don Toliver - Lose My Mind (feat. Doja Cat) [From F1 The Movie] [Official Audio]", channel: "F1 The Album" },
  { id: "variant0003", title: "Lose My Mind Ft. Doja Cat – Don Toliver (Official Movie Version) | F1: The Movie", channel: "Kick It To The King Productions" },
  { id: "variant0004", title: "Don Toliver - Lose My Mind (Official Visualizer)", channel: "Don Toliver" },
];

const noIdea = { id: "othertrack1", title: "Don Toliver - No Idea (Official Music Video)", channel: "Don Toliver" };

test("canonical song identity collapses alternate uploads of the same recording", () => {
  assert.equal(canonicalSongTitle(seed), "lose my mind");
  assert.equal(canonicalSongIdentity(seed), "don toliver|lose my mind");
  variants.forEach((track) => {
    assert.equal(canonicalSongTitle(track), "lose my mind");
    assert.equal(canonicalSongIdentity(track), "don toliver|lose my mind");
  });
});

test("radio auto-extension rejects alternate uploads and repeated seed-artist tracks", () => {
  let state = reducer(undefined, startYoutubePlayback({ track: seed, queue: [seed] }));
  state = reducer(state, appendToQueue([
    ...variants,
    noIdea,
    { id: "othertrack2", title: "After Party", channel: "Don Toliver - Topic" },
    { id: "othertrack3", title: "Brett Eldredge - Lose My Mind (Official Music Video)", channel: "Brett Eldredge" },
    { id: "othertrack4", title: "PARTYNEXTDOOR - LOSE MY MIND (Official Visualizer)", channel: "PARTYNEXTDOOR" },
  ]));

  assert.deepEqual(
    state.youtubeQueue.map((track) => canonicalSongIdentity(track)),
    [
      "don toliver|lose my mind",
      "brett eldredge|lose my mind",
      "partynextdoor|lose my mind",
    ],
  );
  assert.equal(state.queueManualEnd, false);
});

test("stale controller fallback cannot advance to a rejected alternate upload", () => {
  const differentArtist = { id: "othertrack3", title: "Brett Eldredge - Lose My Mind (Official Music Video)", channel: "Brett Eldredge" };
  let state = reducer(undefined, startYoutubePlayback({ track: seed, queue: [seed] }));
  state = reducer(state, appendToQueue([variants[0], noIdea, differentArtist]));
  assert.deepEqual(state.youtubeQueue.map((track) => track.id), [seed.id, differentArtist.id]);

  // The controller can still hold the pre-filtered first candidate for one tick.
  state = reducer(state, setYoutubeVideo(variants[0]));
  assert.equal(state.youtubeVideo.id, differentArtist.id);
  assert.equal(canonicalSongIdentity(state.youtubeVideo), "brett eldredge|lose my mind");
});

test("finite playlist queues keep explicit order even when titles repeat", () => {
  let state = reducer(undefined, startYoutubePlayback({
    track: seed,
    queue: [seed],
    autoExtend: false,
  }));
  state = reducer(state, appendToQueue([
    { id: "othertrack3", title: "Brett Eldredge - Lose My Mind (Official Music Video)", channel: "Brett Eldredge" },
  ]));

  assert.equal(state.youtubeQueue.length, 2);
  assert.equal(state.queueManualEnd, true);
});
test("radio rejects same-song families uploaded by different artists or channels", () => {
  const montage = {
    id: "montage0001",
    title: "MONTAGEM ALQUIMIA",
    channel: "MAFIA",
    seedQuery: "montagem alquimia",
  };
  const sameSongVariants = [
    { id: "montage0002", title: "MONTAGEM ALQUIMIA_SLOWED_H6", channel: "Black mafia 2.0", seedQuery: "montagem alquimia" },
    { id: "montage0003", title: "MONTAGEM ALQUIMIA MAFIA 3#phonk #edit #montagem", channel: "YAMAXA707", seedQuery: "montagem alquimia" },
    { id: "montage0004", title: "MONTAGEM ALQUIMIA — MAFIA", channel: "PHONK_AURA", seedQuery: "montagem alquimia" },
    { id: "montage0005", title: "MONTAGEM ALQUIMIA PHONK#MAFIA#phonkmusic", channel: "CRNX-EDITZ", seedQuery: "montagem alquimia" },
    { id: "montage0006", title: "MONTAGEM ALQUIMIA - (Official Music Video)", channel: "h6itam and 2 more", seedQuery: "montagem alquimia" },
  ];
  const relatedDifferentSong = {
    id: "related0001",
    title: "MONTAGEM TOMADA",
    channel: "ATLXS",
    seedQuery: "montagem alquimia",
  };

  let state = reducer(undefined, startYoutubePlayback({ track: montage, queue: [montage], queueMode: "radio" }));
  state = reducer(state, appendToQueue([...sameSongVariants, relatedDifferentSong]));

  assert.deepEqual(state.youtubeQueue.map((track) => track.id), [montage.id, relatedDifferentSong.id]);
});


test("radio song-family fallback keeps unrelated artists with the same or prefixed title", () => {
  assert.equal(
    sameRadioSongFamily(
      { id: "same-title-a", title: "Stay With Me", channel: "Artist Alpha" },
      { id: "same-title-b", title: "Stay With Me", channel: "Artist Beta" },
    ),
    false,
  );
  assert.equal(
    sameRadioSongFamily(
      { id: "prefix-a", title: "Love Story", channel: "Artist Alpha" },
      { id: "prefix-b", title: "Love Story Part 2", channel: "Artist Beta" },
    ),
    false,
  );
  assert.equal(
    sameRadioSongFamily(
      { id: "variant-a", title: "MONTAGEM ALQUIMIA", channel: "MAFIA" },
      { id: "variant-b", title: "MONTAGEM ALQUIMIA SLOWED + REVERB", channel: "Uploader Two" },
    ),
    true,
  );
});


test("radio queue rejects automatic tracks from recently played artists but preserves explicit user intent", () => {
  const artistB1 = { id: "artistb0001", title: "First B Song", channel: "Artist B" };
  const artistC = { id: "artistc0001", title: "C Song", channel: "Artist C" };
  const artistB2 = { id: "artistb0002", title: "Second B Song", channel: "Artist B - Topic" };
  const artistD = { id: "artistd0001", title: "D Song", channel: "Artist D" };

  let state = reducer(undefined, startYoutubePlayback({ track: seed, queue: [seed, artistB1, artistC], queueMode: "radio" }));
  state = reducer(state, setYoutubeVideo(artistB1));
  state = reducer(state, setYoutubeVideo(artistC));
  state = reducer(state, appendToQueue([artistB2, artistD]));

  assert.deepEqual(
    state.youtubeQueue.slice(state.youtubeQueue.findIndex((item) => item.id === artistC.id) + 1).map((item) => item.channel),
    ["Artist D"],
  );

  state = reducer(state, addToQueue(artistB2));
  assert.ok(state.youtubeQueue.some((item) => item.id === artistB2.id && item.queueSource === "user"));
});


test("explicit current-track replacement may choose another cut of the same song", () => {
  const alternateCut = {
    id: "variant90001",
    title: "Lose My Mind (feat. Doja Cat) [Official Audio]",
    channel: "Don Toliver - Topic",
  };
  let state = reducer(undefined, startYoutubePlayback({
    track: seed,
    queue: [seed],
    queueMode: "radio",
  }));

  state = reducer(state, replaceCurrentYoutubeTrack(alternateCut));

  assert.equal(state.youtubeVideo.id, alternateCut.id);
  assert.equal(state.youtubeQueue[0].id, alternateCut.id);
  assert.equal(canonicalSongIdentity(state.youtubeVideo), canonicalSongIdentity(seed));
});


test("same-song upload replacement keeps the radio origin stable without creating history", () => {
  const origin = {
    id: "origin00001",
    title: "Origin Artist - Night Drive",
    channel: "Origin Artist",
    seedQuery: "deep house night drive",
    genre: "Deep House",
  };
  const alternate = {
    id: "mirror00001",
    title: "Night Drive (Official Audio)",
    channel: "Mirror Upload - Topic",
    seedQuery: "night drive official audio",
    genre: "Official Audio",
  };
  let state = reducer(undefined, startYoutubePlayback({
    track: origin,
    queue: [origin],
    queueMode: "radio",
    context: { type: "radio", id: origin.id, name: "Deep House Radio" },
  }));
  const entryId = state.youtubeVideo.queueEntryId;

  state = reducer(state, replaceCurrentYoutubeTrack(alternate));

  assert.equal(state.youtubeVideo.id, alternate.id);
  assert.equal(state.youtubeVideo.queueEntryId, entryId);
  assert.equal(state.youtubeVideo.channel, "Mirror Upload");
  assert.equal(state.youtubeVideo.seedQuery, origin.seedQuery);
  assert.equal(state.youtubeVideo.genre, origin.genre);
  assert.equal(state.youtubeVideo.radioSeedArtist, "origin artist");
  assert.deepEqual(state.playbackContext, {
    type: "radio",
    id: alternate.id,
    name: "Deep House Radio",
  });
  assert.deepEqual(state.history, []);
});
