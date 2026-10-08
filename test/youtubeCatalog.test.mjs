import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ApiRouteError } from "../src/utils/apiResponseCore.mjs";
import { cleanTitle } from "../src/utils/text.js";
import { filterMusicPlaybackResults } from "../src/utils/officialMusicSearch.mjs";

const source = (await readFile(new URL("../src/utils/youtubeApi.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?;\n/gm, "").replace(/export /g, "").replace("Log.setLevel(Log.Level.ERROR);", "");
const CHANNEL = "UCaaaaaaaaaaaaaaaaaaaaaa";
const video = (id) => ({ id: { videoId: id }, snippet: { title: "Artist - Song (Official Audio)", channelTitle: "Artist", channelId: CHANNEL } });
function catalog({ official = async () => ({ ok: false, status: 503 }), upstream = async () => ({ ok: false, status: 503 }), fallback = async () => null } = {}) {
  return new Function("ApiRouteError", "createProviderTransport", "reportProvider", "cleanTitle", "filterMusicPlaybackResults", "isYoutubeVideoId", "official", "upstream", "fallback",
    `${source}\nfetchFromOfficialApi = official; youtubeFetch = upstream; channelFromInnertube = fallback; return { fetchYouTubeChannel, fetchYoutubeTracksByIds, hydrateYoutubeCatalogTracks, mapSearchResult, mapPlaylistItem };`)(
    ApiRouteError, () => null, () => {}, cleanTitle, filterMusicPlaybackResults, id => /^[A-Za-z0-9_-]{11}$/.test(id), official, upstream, fallback,
  );
}

test("total catalog provider failure is retryable, not a successful empty artist", async () => {
  for (const status of [503, 429, 502]) {
    const api = catalog({ official: async () => ({ ok: false, status }), upstream: async () => ({ ok: false, status }) });
    await assert.rejects(api.fetchYouTubeChannel(CHANNEL), error => error.status >= 500);
  }
});

test("valid empty catalogs and usable partial catalogs remain successful", async () => {
  const empty = catalog({ upstream: async () => ({ ok: true, data: { items: [] } }) });
  assert.deepEqual((await empty.fetchYouTubeChannel(CHANNEL)).tracks, []);
  const partial = catalog({ official: async endpoint => endpoint === "search" ? { ok: true, data: { items: [video("abcdefghijk")] } } : null });
  assert.deepEqual((await partial.fetchYouTubeChannel(CHANNEL)).tracks.map(t => t.id), ["abcdefghijk"]);
});

test("failed catalog pagination rejects rather than marking the catalog exhausted", async () => {
  await assert.rejects(catalog().fetchYouTubeChannel(CHANNEL, { pageToken: "next" }));
});

test("duration enrichment returns original tracks when upstream body ignores cancellation", async () => {
  const tracks = [{ id: "abcdefghijk", title: "Song" }];
  const api = catalog({ upstream: () => new Promise(() => {}) });
  const keepAlive = setTimeout(() => {}, 6000);
  try {
    const result = await Promise.race([
      api.hydrateYoutubeCatalogTracks(tracks),
      new Promise((_, reject) => setTimeout(() => reject(new Error("enrichment exceeded its deadline")), 4500)),
    ]);
    assert.deepEqual(result, tracks);
  } finally { clearTimeout(keepAlive); }
});

test("artist catalog hydrates durations in bounded video batches without changing identity or order", async () => {
  const ids = Array.from({ length: 60 }, (_, i) => String(i).padStart(11, "0"));
  const batches = [];
  const api = catalog({
    official: async endpoint => endpoint === "search" ? { ok: true, data: { items: ids.map(video) } } : null,
    upstream: async (endpoint, params) => {
      if (endpoint !== "videos") return { ok: false, status: 503 };
      batches.push(params.id.split(","));
      return { ok: true, data: { items: params.id.split(",").reverse().map(id => ({ id, snippet: { title: "Song", channelId: CHANNEL }, contentDetails: { duration: "PT4M3S" } })) } };
    },
  });
  const result = await api.fetchYouTubeChannel(CHANNEL);
  assert.deepEqual(result.tracks.map(t => t.id), ids);
  assert.ok(result.tracks.every(t => t.duration === 243 && t.channelId === CHANNEL));
  assert.deepEqual(batches.map(batch => batch.length), [50, 10]);
});


test("catalog enrichment forbids per-video fallback fanout and preserves usable unknown tracks", async () => {
  const track = { id: "abcdefghijk", title: "Artist - Song", channelId: CHANNEL, artists: [{ name: "Artist", channelId: CHANNEL }] };
  const api = catalog({ upstream: async (_endpoint, _params, options) => {
    assert.equal(options.requireOfficial, true);
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: false, status: 503 };
  } });
  assert.deepEqual(await api.hydrateYoutubeCatalogTracks([track]), [track]);
});

test("Innertube catalog listings retain supplied duration without a second metadata lookup", () => {
  const api = catalog();
  const item = { id: "abcdefghijk", title: "Artist - Song", duration: { seconds: 243 }, author: { name: "Artist", id: CHANNEL } };
  assert.equal(api.mapSearchResult(item, "video").contentDetails?.duration, "PT4M3S");
  assert.equal(api.mapPlaylistItem(item).contentDetails?.duration, "PT4M3S");
});
