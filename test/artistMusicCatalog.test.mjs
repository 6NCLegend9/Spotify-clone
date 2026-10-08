import test from "node:test";
import assert from "node:assert/strict";

const moduleUrl = new URL("../src/utils/artistMusicCatalog.mjs", import.meta.url);
const catalog = await import(moduleUrl);
const CHANNEL = "UCaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "UCbbbbbbbbbbbbbbbbbbbbbb";
const image = [{ url: "https://lh3.googleusercontent.com/artist", width: 1200 }];
const song = (id, extra = {}) => ({ id, title: { text: "Real song" }, item_type: "song", artists: [{ name: "Artist", channel_id: CHANNEL }], duration: { seconds: 213 }, thumbnail: image, ...extra });
const shelf = (title, contents) => ({ header: { title: { text: title } }, contents });

test("artist sections retain provider shelf provenance instead of guessing releases from videos", () => {
  assert.equal(typeof catalog.normalizeArtistMusicSections, "function", "artist section normalization must exist");
  const result = catalog.normalizeArtistMusicSections(CHANNEL, {
    header: { title: { text: "Artist" }, description: { text: "Their biography" }, thumbnail: { contents: image } },
    sections: [
      { title: { text: "Top songs" }, contents: [song("abcdefghijk"), song("abcdefghijk"), song("not-video")] },
      shelf("Albums", [{ id: "MPREb_album", title: "Album", item_type: "album", year: "2024", thumbnail: image }]),
      shelf("Singles and EPs", [{ id: "MPREb_single", title: "Single", item_type: "album", thumbnail: image }, { id: "MPREb_ep", title: "An EP", item_type: "album", subtitle: { text: "EP • 2023" }, thumbnail: image }]),
      shelf("Videos", [song("lmnopqrstuv", { item_type: "video", views: "10M views" })]),
      shelf("Featured on", [{ id: "VLPL_real", title: "Real playlist", item_type: "playlist", thumbnail: image }]),
      shelf("Fans might also like", [{ id: OTHER, title: "Other artist", item_type: "artist", thumbnail: image }, { id: CHANNEL, title: "Artist", item_type: "artist" }]),
      shelf("Uploads", [song("xxxxxxxxxxx")]),
    ],
  });
  assert.equal(result.artist.id, CHANNEL);
  assert.equal(result.artist.banner, image[0].url);
  assert.equal(result.artist.description, "Their biography");
  assert.deepEqual(result.popularTracks.map(track => track.id), ["abcdefghijk"]);
  assert.equal(result.popularTracks[0].duration, 213);
  assert.deepEqual(result.popularTracks[0].artists, [{ name: "Artist", channelId: CHANNEL }]);
  assert.deepEqual(result.releases.map(release => release.type), ["album", "single", "ep"]);
  assert.equal(result.releases[0].year, "2024");
  assert.equal(result.musicVideos[0].id, "lmnopqrstuv");
  assert.equal(result.playlists[0].id, "PL_real");
  assert.deepEqual(result.relatedArtists.map(artist => artist.id), [OTHER]);
  assert.equal("monthlyListeners" in result.artist, false);
  assert.equal("verified" in result.artist, false);
});

test("optional artist metadata stays empty when absent and untrusted image URLs are discarded", () => {
  assert.equal(typeof catalog.normalizeArtistMusicSections, "function", "artist section normalization must exist");
  const result = catalog.normalizeArtistMusicSections(CHANNEL, {
    header: { title: "Artist", thumbnail: { contents: [{ url: "https://untrusted.example/image" }] } },
    sections: [shelf("Songs", [song("abcdefghijk")]), shelf("Unknown releases", [{ id: "MPREb_unknown", title: "Unknown", item_type: "album" }])],
  });
  assert.equal(result.artist.banner, "");
  assert.deepEqual(result.popularTracks, []);
  assert.deepEqual(result.releases, []);
});

test("music albums expose only playable video IDs and preserve distinct credited artists", () => {
  assert.equal(typeof catalog.normalizeMusicAlbum, "function", "album normalization must exist");
  const result = catalog.normalizeMusicAlbum("MPREb_album", {
    header: { title: "Album", subtitle: { text: "Album • 2024" }, year: "2024", thumbnails: image, author: { name: "Artist", channel_id: CHANNEL } },
    contents: [song("abcdefghijk", { artists: [{ name: "Artist", channel_id: CHANNEL }, { name: "Guest", channel_id: OTHER }] }), song("private"), song("lmnopqrstuv", { artists: undefined, thumbnail: undefined })],
  });
  assert.equal(result.album.title, "Album");
  assert.equal(result.album.type, "album");
  assert.deepEqual(result.tracks.map(track => track.id), ["abcdefghijk", "lmnopqrstuv"]);
  assert.deepEqual(result.tracks[0].artists.map(artist => artist.channelId), [CHANNEL, OTHER]);
  assert.equal(result.tracks[1].channelId, CHANNEL);
  assert.equal(result.tracks[1].thumbnail, image[0].url);
});

test("responsive album headers retain actual strapline artist credits, description shelves and release year", () => {
  const result = catalog.normalizeMusicAlbum("MPREb_album", {
    header: {
      type: "MusicResponsiveHeader", title: { text: "Responsive album" },
      subtitle: { text: "EP" }, second_subtitle: { text: "2023 • 4 songs • 15 minutes" },
      strapline_text_one: { runs: [
        { text: "Artist", endpoint: { payload: { browseId: CHANNEL } } },
        { text: " • " },
        { text: "Guest", endpoint: { payload: { browseId: OTHER } } },
      ] },
      thumbnail: { contents: image }, description: { type: "MusicDescriptionShelf", description: { text: "A real release description" } },
    }, contents: [song("abcdefghijk", { artists: undefined })],
  });
  assert.equal(result.album.year, "2023");
  assert.equal(result.album.type, "ep");
  assert.equal(result.album.description, "A real release description");
  assert.deepEqual(result.album.artists, [{ name: "Artist", channelId: CHANNEL }, { name: "Guest", channelId: OTHER }]);
  assert.deepEqual(result.tracks[0].artists, result.album.artists);
});

test("responsive videos and related artists retain their parsed authors and name fields", () => {
  const result = catalog.normalizeArtistMusicSections(CHANNEL, {
    header: { title: "Artist" }, sections: [
      shelf("Videos", [{ id: "abcdefghijk", title: "Video", item_type: "video", authors: [{ name: "Artist", channel_id: CHANNEL }, { name: "Guest", channel_id: OTHER }], duration: { text: "4:03" } }]),
      shelf("Fans might also like", [{ id: OTHER, name: "Guest", item_type: "artist", thumbnail: { contents: image } }]),
    ],
  });
  assert.deepEqual(result.musicVideos[0].artists.map(artist => artist.channelId), [CHANNEL, OTHER]);
  assert.equal(result.musicVideos[0].duration, 243);
  assert.equal(result.relatedArtists[0].title, "Guest");
});

test("artist reads use the exact channel ID and coalesce successful reads", async () => {
  assert.equal(typeof catalog.createMusicCatalogReader, "function", "bounded music catalog reader must exist");
  let reads = 0;
  const reader = catalog.createMusicCatalogReader(async () => ({ music: { getArtist: async id => {
    reads++;
    assert.equal(id, CHANNEL);
    return { header: { title: "Same name" }, sections: [] };
  } } }));
  const [first, second] = await Promise.all([reader.artist(CHANNEL), reader.artist(CHANNEL)]);
  assert.equal(first.artist.id, CHANNEL);
  assert.deepEqual(second, first);
  await reader.artist(CHANNEL);
  assert.equal(reads, 1);
});

test("music provider failures remain retryable and are not cached as empty sections", async () => {
  assert.equal(typeof catalog.createMusicCatalogReader, "function", "bounded music catalog reader must exist");
  let failed = true;
  const reader = catalog.createMusicCatalogReader(async () => ({ music: { getArtist: async () => {
    if (failed) throw new Error("Upstream unavailable");
    return { header: { title: "Artist" }, sections: [] };
  } } }));
  await assert.rejects(reader.artist(CHANNEL), error => error.code === "SERVICE_UNAVAILABLE");
  failed = false;
  assert.equal((await reader.artist(CHANNEL)).artist.title, "Artist");
});

test("malformed artist and album responses stay retryable while titled empty catalogs remain valid", async () => {
  for (const kind of ["artist", "album"]) {
    let usable = false;
    const reader = catalog.createMusicCatalogReader(async () => ({ music: {
      getArtist: async () => usable ? { header: { title: "Artist" }, sections: [] } : {},
      getAlbum: async () => usable ? { header: { title: "Album" }, contents: [] } : {},
    } }));
    const id = kind === "artist" ? CHANNEL : "MPREb_album";
    await assert.rejects(reader[kind](id), error => error.code === "SERVICE_UNAVAILABLE");
    usable = true;
    const value = await reader[kind](id);
    assert.equal(value[kind].title, kind === "artist" ? "Artist" : "Album");
  }
});

test("in-flight catalog requests have a bounded admission limit", async () => {
  let finish;
  const reader = catalog.createMusicCatalogReader(async () => ({ music: { getArtist: () => new Promise(resolve => { finish ||= resolve; }) } }), { maxEntries: 1, timeoutMs: 100 });
  const pending = reader.artist(CHANNEL);
  await new Promise(resolve => setImmediate(resolve));
  try {
    await assert.rejects(Promise.race([
      reader.artist(OTHER),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Admission limit did not reject promptly")), 25)),
    ]), error => error.code === "SERVICE_UNAVAILABLE");
  } finally {
    finish({ header: { title: "Artist" }, sections: [] });
    assert.equal((await pending).artist.title, "Artist");
  }
});

test("an unresponsive music provider has a total read deadline", async () => {
  assert.equal(typeof catalog.createMusicCatalogReader, "function", "bounded music catalog reader must exist");
  const reader = catalog.createMusicCatalogReader(() => new Promise(() => {}), { timeoutMs: 20 });
  await assert.rejects(reader.artist(CHANNEL), error => error.code === "SERVICE_UNAVAILABLE");
});

test("timed-out artist and album reads retain admission until their provider settles without caching late data", async () => {
  for (const kind of ["artist", "album"]) {
    let finish;
    let calls = 0;
    let allowFresh = false;
    const provider = () => {
      calls++;
      if (!allowFresh) return new Promise(resolve => { finish ||= resolve; });
      return { header: { title: "Fresh catalog" }, sections: [], contents: [] };
    };
    const reader = catalog.createMusicCatalogReader(async () => ({ music: {
      getArtist: provider, getAlbum: provider,
    } }), { maxEntries: 1, timeoutMs: 5 });
    const id = kind === "artist" ? CHANNEL : "MPREb_album";
    await assert.rejects(reader[kind](id), error => error.code === "SERVICE_UNAVAILABLE");
    for (let attempt = 0; attempt < 3; attempt++) {
      await assert.rejects(reader[kind](id), error => error.code === "SERVICE_UNAVAILABLE");
    }
    const otherId = kind === "artist" ? OTHER : "MPREb_other";
    await assert.rejects(reader[kind](otherId), error => error.code === "SERVICE_UNAVAILABLE");
    assert.equal(calls, 1, "timed-out retries must not create additional underlying provider reads");
    allowFresh = true;
    finish({ header: { title: "Late stale catalog" }, sections: [], contents: [] });
    await new Promise(resolve => setImmediate(resolve));
    const fresh = await reader[kind](id);
    assert.equal(fresh[kind].title, "Fresh catalog", "late provider results must not populate the success cache");
    assert.equal(calls, 2, "a settled provider read must free admission for a fresh retry");
    assert.equal((await reader[kind](id))[kind].title, "Fresh catalog");
    assert.equal(calls, 2);
  }
});

test("album reads preserve their provider browse ID and return real songs", async () => {
  assert.equal(typeof catalog.createMusicCatalogReader, "function", "bounded music catalog reader must exist");
  const reader = catalog.createMusicCatalogReader(async () => ({ music: { getAlbum: async id => {
    assert.equal(id, "MPREb_album");
    return { header: { title: "Album" }, contents: [song("abcdefghijk")] };
  } } }));
  assert.deepEqual((await reader.album("MPREb_album")).tracks.map(track => track.id), ["abcdefghijk"]);
});
