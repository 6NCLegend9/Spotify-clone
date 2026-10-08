import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./support/artist-music-provider-loader.mjs", import.meta.url);
const { fetchYouTubeArtistSections, fetchYouTubeMusicAlbum, youtubeFetch } = await import("../src/utils/youtubeApi.js");
const CHANNEL = "UCaaaaaaaaaaaaaaaaaaaaaa";

test("real no-key provider pipeline returns exact artist sections and playable release songs", async () => {
  const previousKey = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  globalThis.__artistMusicProviderFixture = { music: {
    getArtist: async id => {
      assert.equal(id, CHANNEL);
      return { header: { title: "Artist" }, sections: [{ title: { text: "Top songs" }, contents: [{ id: "abcdefghijk", title: "Real song", artists: [{ name: "Artist", channel_id: CHANNEL }] }] }] };
    },
    getAlbum: async id => {
      assert.equal(id, "MPREb_real");
      return { header: { title: "Real album" }, contents: [{ id: "abcdefghijk", title: "Real song" }] };
    },
  } };
  try {
    assert.deepEqual((await fetchYouTubeArtistSections(CHANNEL)).popularTracks.map(track => track.id), ["abcdefghijk"]);
    assert.deepEqual((await fetchYouTubeMusicAlbum("MPREb_real")).tracks.map(track => track.id), ["abcdefghijk"]);
  } finally {
    delete globalThis.__artistMusicProviderFixture;
    if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previousKey;
  }
});

test("real no-key playlist fallback provides metadata so featuring cards can open songs", async () => {
  const previousKey = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  globalThis.__artistMusicProviderFixture = { getPlaylist: async id => {
    assert.equal(id, "PL_real");
    return {
      info: { title: "Featuring Artist", description: "A real playlist", author: { name: "Curator", id: CHANNEL }, thumbnails: [{ url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", width: 480 }] },
      items: [{ id: "abcdefghijk", title: "Real song", author: { name: "Artist", id: CHANNEL }, duration: { seconds: 213 } }],
    };
  } };
  try {
    const metadata = await youtubeFetch("playlists", { id: "PL_real", part: "snippet,contentDetails" });
    assert.equal(metadata.ok, true);
    assert.equal(metadata.data.items[0].snippet.title, "Featuring Artist");
    assert.equal(metadata.data.items[0].snippet.channelTitle, "Curator");
    const songs = await youtubeFetch("playlistItems", { playlistId: "PL_real", maxResults: "50" });
    assert.equal(songs.data.items[0].snippet.resourceId.videoId, "abcdefghijk");
  } finally {
    delete globalThis.__artistMusicProviderFixture;
    if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previousKey;
  }
});
