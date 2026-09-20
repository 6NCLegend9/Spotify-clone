import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./support/youtube-provider-loader.mjs", import.meta.url);
const { youtubeFetch } = await import("../src/utils/youtubeApi.js");

test("real provider pipeline recovers from HTTP failure without inventing embed permission", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  let libraryCalls = 0;
  globalThis.fetch = async () => { throw new DOMException("Timeout", "AbortError"); };
  globalThis.__youtubeSearchFixture = async (query) => {
    libraryCalls += 1;
    assert.equal(query, "guest search regression");
    return { results: [{ video_id: "abcdefghijk", title: "Requested song", author: { name: "Artist" } }] };
  };
  try {
    const result = await youtubeFetch("search", { type: "video", q: "guest search regression" });
    assert.equal(result.ok, true);
    assert.equal(result.source, "fallback");
    assert.equal(libraryCalls, 1);
    assert.equal(result.data.items[0].snippet.title, "Requested song");
    assert.equal(result.data.items[0].status.embeddable, undefined);

    const filtered = await youtubeFetch("search", { type: "video", q: "filter regression" }, { requireOfficial: true });
    assert.equal(filtered.status, 503);
    assert.equal(libraryCalls, 1, "official-only filters must not silently degrade");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__youtubeSearchFixture;
    if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalKey;
  }
});
