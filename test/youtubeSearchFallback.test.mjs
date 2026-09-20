import test from "node:test";
import assert from "node:assert/strict";
import { firstSuccessfulSearch } from "../src/utils/youtubeSearchFallback.mjs";

test("a timed-out HTTP search still runs the next search provider", async () => {
  const data = { items: [{ id: { videoId: "abcdefghijk" } }] };
  const result = await firstSuccessfulSearch([
    async () => { throw new DOMException("Timeout", "AbortError"); },
    async () => ({ ok: true, status: 200, data }),
  ]);
  assert.deepEqual(result, { ok: true, status: 200, data, source: "fallback" });
});

test("provider failures are an error, not an empty successful search", async () => {
  assert.deepEqual(await firstSuccessfulSearch([
    async () => null,
    async () => { throw new Error("upstream unavailable"); },
  ]), { ok: false, status: 502, source: "fallback", data: null });
});

test("a successful empty search is valid and does not call more providers", async () => {
  let calls = 0;
  const result = await firstSuccessfulSearch([
    async () => ({ ok: true, status: 200, data: { items: [] } }),
    async () => { calls += 1; },
  ]);
  assert.equal(calls, 0);
  assert.deepEqual(result.data.items, []);
});
