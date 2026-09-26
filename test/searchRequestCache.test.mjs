import assert from "node:assert/strict";
import test from "node:test";
import {
  createSearchRequestCache,
  normalizeSearchRequestKey,
} from "../src/utils/searchRequestCache.mjs";

test("normalizes equivalent interactive queries into the same cache key", () => {
  assert.equal(
    normalizeSearchRequestKey({ purpose: "interactive", query: "  Chris   Brown " }),
    normalizeSearchRequestKey({ purpose: "interactive", query: "chris brown" }),
  );
  assert.notEqual(
    normalizeSearchRequestKey({ purpose: "interactive", query: "chris brown" }),
    normalizeSearchRequestKey({ purpose: "queue", query: "chris brown" }),
  );
});

test("shares one in-flight request for an identical key", async () => {
  const cache = createSearchRequestCache({ ttlMs: 1000, maxEntries: 8 });
  let calls = 0;
  const factory = async () => {
    calls += 1;
    await Promise.resolve();
    return { results: [1] };
  };
  const [a, b] = await Promise.all([
    cache.getOrCreate("interactive:chris brown", factory),
    cache.getOrCreate("interactive:chris brown", factory),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
});

test("reuses fulfilled results inside TTL but expires them afterwards", async () => {
  let now = 1000;
  const cache = createSearchRequestCache({ ttlMs: 500, maxEntries: 8, now: () => now });
  let calls = 0;
  const factory = async () => ({ call: ++calls });

  assert.deepEqual(await cache.getOrCreate("interactive:test", factory), { call: 1 });
  now += 200;
  assert.deepEqual(await cache.getOrCreate("interactive:test", factory), { call: 1 });
  now += 501;
  assert.deepEqual(await cache.getOrCreate("interactive:test", factory), { call: 2 });
});

test("rejected requests are never retained", async () => {
  const cache = createSearchRequestCache({ ttlMs: 1000, maxEntries: 8 });
  let calls = 0;
  await assert.rejects(
    cache.getOrCreate("interactive:test", async () => {
      calls += 1;
      throw new Error("aborted");
    }),
    /aborted/,
  );
  const value = await cache.getOrCreate("interactive:test", async () => ({ call: ++calls }));
  assert.deepEqual(value, { call: 2 });
});

test("bounds entries by evicting the oldest key", async () => {
  const cache = createSearchRequestCache({ ttlMs: 1000, maxEntries: 2 });
  await cache.getOrCreate("a", async () => 1);
  await cache.getOrCreate("b", async () => 2);
  await cache.getOrCreate("c", async () => 3);
  assert.equal(cache.size(), 2);
  assert.equal(cache.has("a"), false);
  assert.equal(cache.has("b"), true);
  assert.equal(cache.has("c"), true);
});
