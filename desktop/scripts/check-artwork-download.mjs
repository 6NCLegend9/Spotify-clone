import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import * as artwork from "../src/artworkPalette.mjs";

const source = fs.readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
const code = source.slice(source.indexOf("async function accentFromArtwork("), source.indexOf("async function refreshAppearanceAccent("));
function harness({ chunks = 7, chunkBytes = 1024 * 1024, type = "image/jpeg", length, fetchGate, failFirst = false } = {}) {
  let reads = 0, requests = 0, cancelled = false, decoded = 0;
  const stream = new ReadableStream({
    pull(controller) { if (reads === chunks) controller.close(); else { reads++; controller.enqueue(new Uint8Array(chunkBytes)); } },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const headers = { "content-type": type };
  if (length !== undefined) headers["content-length"] = String(length);
  const response = new Response(stream, { headers });
  const context = vm.createContext({ ...artwork, Buffer, AbortSignal, artworkAccentCache: new Map(), artworkAccentPending: new Map(),
    net: { fetch: async () => { const request = ++requests; await fetchGate; if (failFirst && request === 1) throw new Error("temporary network failure"); return response; } },
    nativeImage: { createFromBuffer: () => { decoded++; return { isEmpty: () => false, resize: () => ({ toBitmap: () => Buffer.alloc(16) }) }; } },
  });
  vm.runInContext(code, context);
  return { get reads() { return reads; }, get requests() { return requests; }, get cancelled() { return cancelled; }, get decoded() { return decoded; },
    run: () => context.accentFromArtwork("https://i.ytimg.com/vi/test/default.jpg") };
}

test("unannounced oversized artwork is cancelled before the remaining body is read", async () => {
  const h = harness();
  await assert.rejects(h.run(), /large/i);
  assert.equal(h.reads, 6, "Stop at the first chunk exceeding the five MB limit");
  assert.equal(h.cancelled, true);
  assert.equal(h.decoded, 0);
});

test("concurrent playback updates share one artwork download and decode", async () => {
  let release;
  const fetchGate = new Promise(resolve => { release = resolve; });
  const h = harness({ chunks: 1, chunkBytes: 20, fetchGate });
  const pending = Array.from({ length: 20 }, () => h.run());
  release();
  const results = await Promise.allSettled(pending);
  assert.equal(h.requests, 1);
  assert.equal(h.decoded, 1);
  assert(results.every(result => result.status === "fulfilled"));
});

test("a failed artwork download can be retried successfully", async () => {
  const h = harness({ chunks: 1, chunkBytes: 20, failFirst: true });
  await assert.rejects(h.run(), /temporary/);
  await h.run();
  assert.equal(h.requests, 2);
  assert.equal(h.decoded, 1);
});

test("unsupported or declared oversized artwork cancels without consuming its body", async () => {
  for (const options of [{ type: "text/html" }, { length: 6 * 1024 * 1024 }]) {
    const h = harness(options);
    await assert.rejects(h.run());
    assert.equal(h.reads, 0);
    assert.equal(h.cancelled, true);
  }
});

test("supported artwork decodes once and subsequent calls use the bounded cache", async () => {
  const h = harness({ chunks: 2, chunkBytes: 20 });
  const accent = await h.run();
  assert.equal(await h.run(), accent);
  assert.equal(h.reads, 2);
  assert.equal(h.decoded, 1);
});

test("the exact size limit is accepted but an empty body never reaches the decoder", async () => {
  const boundary = harness({ chunks: 5 });
  await boundary.run();
  assert.equal(boundary.decoded, 1);
  const empty = harness({ chunks: 0 });
  await assert.rejects(empty.run(), /empty/i);
  assert.equal(empty.decoded, 0);
});

test("buffer growth preserves bytes across differently sized chunks", async () => {
  const parts = [Buffer.alloc(17, 1), Buffer.alloc(70000, 2), Buffer.alloc(9, 3)];
  let index = 0;
  const response = new Response(new ReadableStream({ pull(controller) {
    if (index === parts.length) controller.close(); else controller.enqueue(parts[index++]);
  } }), { headers: { "content-type": "image/png" } });
  assert.deepEqual(await artwork.readArtworkBytes(response), Buffer.concat(parts));
});
