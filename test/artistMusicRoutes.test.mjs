import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ApiRouteError, apiErrorStatus, buildApiErrorEnvelope } from "../src/utils/apiResponseCore.mjs";
import { isMusicAlbumId } from "../src/utils/artistMusicCatalog.mjs";

const CHANNEL = "UCaaaaaaaaaaaaaaaaaaaaaa";
const apiError = (code, options = {}) => Response.json(buildApiErrorEnvelope(code, options), {
  status: apiErrorStatus(code, options), headers: { "Cache-Control": "private, no-store", ...(options.retryAfter ? { "Retry-After": String(options.retryAfter) } : {}) },
});

async function route(file, provider, { limited = false } = {}) {
  const source = await readFile(new URL(`../src/app/api/${file}/route.js`, import.meta.url), "utf8").catch(() => "");
  if (!source) return null;
  return new Function("NextResponse", "fetchYouTubeArtistSections", "fetchYouTubeMusicAlbum", "isMusicAlbumId", "getClientKey", "isRateLimited", "apiError", "handleApiError",
    source.replace(/^import[\s\S]*?;\n/gm, "").replace(/export /g, "") + "\nreturn GET;")(
    { json: Response.json }, provider, provider, isMusicAlbumId, () => "fixture",
    async () => ({ limited, retryAfter: 12 }), apiError, error => apiError(error instanceof ApiRouteError ? error.code : "INTERNAL_ERROR"),
  );
}

for (const [name, id, payload] of [
  ["artist-sections", CHANNEL, { artist: { id: CHANNEL }, popularTracks: [], releases: [], playlists: [], musicVideos: [], relatedArtists: [] }],
  ["youtube-album", "MPREb_album", { album: { id: "MPREb_album", title: "Album" }, tracks: [{ id: "abcdefghijk" }] }],
]) {
  test(`${name} returns real provider payload with a public cache policy`, async () => {
    const get = await route(name, async providerId => {
      assert.equal(providerId, id);
      return payload;
    });
    assert.equal(typeof get, "function", "music catalog API route must exist");
    const response = await get({ nextUrl: new URL(`https://example.com/api?id=${id}`) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /s-maxage=900/);
    assert.deepEqual(await response.json(), payload);
  });
  test(`${name} rejects malformed IDs before loading the provider`, async () => {
    const get = await route(name, () => assert.fail("invalid IDs must not reach the provider"));
    assert.equal(typeof get, "function", "music catalog API route must exist");
    for (const badId of ["", "spotify-legacy", "<script>", "x".repeat(130)]) {
      const response = await get({ nextUrl: new URL(`https://example.com/api?id=${encodeURIComponent(badId)}`) });
      assert.equal(response.status, 400);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
  });
  test(`${name} keeps provider errors retryable and uncached`, async () => {
    const get = await route(name, async () => { throw new ApiRouteError("SERVICE_UNAVAILABLE"); });
    assert.equal(typeof get, "function", "music catalog API route must exist");
    const response = await get({ nextUrl: new URL(`https://example.com/api?id=${id}`) });
    assert.equal(response.status, 503);
    assert.match(response.headers.get("cache-control"), /no-store/);
  });
  test(`${name} rate limits before provider work and supplies Retry-After`, async () => {
    const get = await route(name, () => assert.fail("rate-limited request must not reach provider"), { limited: true });
    assert.equal(typeof get, "function", "music catalog API route must exist");
    const response = await get({ nextUrl: new URL(`https://example.com/api?id=${id}`) });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "12");
  });
}
