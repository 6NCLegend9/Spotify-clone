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
    return { results: [{ video_id: "abcdefghijk", title: "Requested song", author: { name: "Artist", id: "UCMIdeeBjp_60Jv7ROpRxK6Q" } }] };
  };
  try {
    const result = await youtubeFetch("search", { type: "video", q: "guest search regression" });
    assert.equal(result.ok, true);
    assert.equal(result.source, "fallback");
    assert.equal(libraryCalls, 1);
    assert.equal(result.data.items[0].snippet.title, "Requested song");
    assert.equal(result.data.items[0].snippet.channelId, "UCMIdeeBjp_60Jv7ROpRxK6Q");
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

test("official snippet search hydrates one bounded batch and preserves full availability cache", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = "test-key";
  const calls = [];
  const metadata = { id: "bcdefghijkl", snippet: { title: "Metadata title", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa" }, contentDetails: { duration: "PT1H2M3S", regionRestriction: { blocked: ["US"] } }, status: { embeddable: false, privacyStatus: "public" } };
  globalThis.fetch = async input => {
    const url = new URL(input);
    calls.push(url);
    if (url.pathname.endsWith("/search")) return Response.json({ nextPageToken: "next", items: [
      { id: { videoId: "abcdefghijk" }, snippet: { title: "First", channelId: "first" }, contentDetails: { duration: "PT4M3S" } },
      { id: { videoId: metadata.id }, snippet: { title: "Second", channelId: "second" } },
    ] });
    assert.equal(url.searchParams.get("id"), metadata.id);
    assert.match(url.searchParams.get("part"), /status/);
    return Response.json({ items: [metadata] });
  };
  try {
    const result = await youtubeFetch("search", { type: "video", q: "official duration batch" });
    assert.equal(result.data.nextPageToken, "next");
    assert.deepEqual(result.data.items.map(item => item.snippet.title), ["First", "Second"]);
    assert.equal(result.data.items[0].contentDetails.duration, "PT4M3S");
    assert.equal(result.data.items[1].contentDetails?.duration, "PT1H2M3S");
    assert.equal(result.data.items[1].snippet.channelId, "second");
    assert.equal(calls.length, 2);
    delete process.env.YOUTUBE_API_KEY;
    const cached = await youtubeFetch("videos", { id: metadata.id });
    assert.deepEqual(cached.data.items[0], metadata);
    assert.equal(calls.length, 2, "reuse complete metadata without another request");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = oldKey;
  }
});

test("metadata failure keeps official search usable without per-video fallback", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = "test-key";
  const items = [{ id: { videoId: "cdefghijklm" }, snippet: { title: "Still usable" } }];
  let calls = 0;
  globalThis.fetch = async input => {
    calls++;
    if (new URL(input).pathname.endsWith("/search")) return Response.json({ items });
    return Response.json({ error: { message: "metadata offline" } }, { status: 404 });
  };
  try {
    const result = await youtubeFetch("search", { type: "video", q: "metadata failure duration" });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.items, items);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = oldKey;
  }
});

test("search metadata enrichment has a deadline even when the metadata body ignores abort", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = "test-key";
  const items = [{ id: { videoId: "defghijklmn" }, snippet: { title: "Usable despite stalled metadata" } }];
  let metadataCalls = 0;
  globalThis.fetch = async input => {
    if (new URL(input).pathname.endsWith("/search")) return Response.json({ items });
    metadataCalls++;
    return { ok: true, status: 200, json: () => new Promise(() => {}) };
  };
  const keepAlive = setTimeout(() => {}, 5000);
  try {
    const result = await Promise.race([
      youtubeFetch("search", { type: "video", q: "bounded stalled metadata" }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("search enrichment exceeded its deadline")), 4500)),
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.items, items);
    assert.equal(metadataCalls, 1);
  } finally {
    clearTimeout(keepAlive);
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = oldKey;
  }
});
