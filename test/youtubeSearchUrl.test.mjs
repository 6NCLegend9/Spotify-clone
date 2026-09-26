import assert from "node:assert/strict";
import test from "node:test";
import { buildYoutubeSearchUrl } from "../src/utils/youtubeSearchUrl.mjs";

test("youtube search URL builder always emits a normalized purpose", () => {
  assert.equal(
    buildYoutubeSearchUrl({ type: "video", q: "Adele Hello" }, "radio"),
    "/api/youtube-search?type=video&q=Adele+Hello&purpose=radio",
  );
  assert.equal(
    buildYoutubeSearchUrl(new URLSearchParams({ q: "Adele" }), "QUEUE"),
    "/api/youtube-search?q=Adele&purpose=queue",
  );
  assert.equal(
    buildYoutubeSearchUrl({ q: "Adele" }, "unknown"),
    "/api/youtube-search?q=Adele&purpose=interactive",
  );
});

test("youtube search URL builder ignores nullish values without dropping zero/false", () => {
  const url = buildYoutubeSearchUrl({
    q: "test",
    pageToken: null,
    seedArtist: undefined,
    zero: 0,
    enabled: false,
  }, "discovery");
  assert.match(url, /^\/api\/youtube-search\?/);
  const params = new URL(`http://localhost${url}`).searchParams;
  assert.equal(params.get("q"), "test");
  assert.equal(params.get("purpose"), "discovery");
  assert.equal(params.has("pageToken"), false);
  assert.equal(params.has("seedArtist"), false);
  assert.equal(params.get("zero"), "0");
  assert.equal(params.get("enabled"), "false");
});
