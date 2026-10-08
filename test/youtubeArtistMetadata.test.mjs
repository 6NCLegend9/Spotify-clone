import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Keep the actual route mapping; isolate only the external provider/security services.
async function routeFor(file, replies) {
  const source = (await readFile(new URL(file, import.meta.url), "utf8")).replace(/^import .*;\n/gm, "").replace(/export /g, "");
  const durationSource = (await readFile(new URL('../src/utils/youtubeApi.js', import.meta.url), 'utf8')).match(/export function parseIsoDuration[\s\S]*?\n}/)[0];
  const parseIsoDuration = new Function(durationSource.replace('export ', '') + '; return parseIsoDuration;')();
  return new Function("NextResponse", "hasYouTubeApiKey", "youtubeFetch", "hydrateYoutubeCatalogTracks", "parseIsoDuration", "cleanTitle", "filterMusicPlaybackResults", "getClientKey", "isRateLimited", "apiError", "handleApiError", `${source}\nreturn GET;`)(
    { json: Response.json }, () => true, async resource => ({ ok: true, data: replies[resource] }), async tracks => tracks, parseIsoDuration, x => x, tracks => tracks,
    () => "fixture", async () => ({ limited: false }), code => Response.json({ code }, { status: 400 }), error => { throw error; },
  );
}

test("saved video details retain the channel identity for artist navigation", async () => {
  const get = await routeFor("../src/app/api/youtube-videos/route.js", { videos: { items: [{ id: "abcdefghijk", snippet: { title: "Song", channelTitle: "2Pac", channelId: "UCMIdeeBjp_60Jv7ROpRxK6Q" }, contentDetails: { duration: "PT3M20S" } }] } });
  const data = await (await get({ nextUrl: new URL("https://example.com/api?id=abcdefghijk") })).json();
  assert.equal(data.tracks[0].channelId, "UCMIdeeBjp_60Jv7ROpRxK6Q");
});

test("playlist tracks link to the video artist rather than the playlist curator", async () => {
  const get = await routeFor("../src/app/api/youtube-playlist/route.js", {
    playlistItems: { items: [{ snippet: { resourceId: { videoId: "abcdefghijk" }, title: "Song", channelTitle: "Curator", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", videoOwnerChannelTitle: "2Pac", videoOwnerChannelId: "UCMIdeeBjp_60Jv7ROpRxK6Q" }, status: { privacyStatus: "public" } }] },
    playlists: { items: [{ snippet: { title: "Playlist" } }] },
  });
  const data = await (await get({ nextUrl: new URL("https://example.com/api?id=PL_fixture") })).json();
  assert.equal(data.tracks[0].channelId, "UCMIdeeBjp_60Jv7ROpRxK6Q");
});
