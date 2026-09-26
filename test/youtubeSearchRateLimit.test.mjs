import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { register } from "node:module";

register("./support/youtube-search-rate-limit-loader.mjs", import.meta.url);
const { GET } = await import("../src/app/api/youtube-search/route.js");

function reset(overrides = {}) {
  globalThis.__YT_RATE_LIMIT_STATE = { counts: Object.create(null), calls: [] };
  globalThis.__YT_RATE_LIMIT_OVERRIDES = overrides;
}

async function search(purpose) {
  const params = new URLSearchParams({ q: "Adele Hello", type: "video" });
  if (purpose !== undefined) params.set("purpose", purpose);
  return GET(new Request(`http://localhost/api/youtube-search?${params}`));
}

beforeEach(() => reset());

test("radio exhaustion does not consume the interactive search bucket", async () => {
  reset({
    "youtube-search:radio": 1,
    "youtube-search:interactive": 2,
    "youtube-search:global": 100,
  });
  assert.equal((await search("radio")).status, 200);
  const blockedRadio = await search("radio");
  assert.equal(blockedRadio.status, 429);
  assert.equal((await search("interactive")).status, 200);
  const keys = globalThis.__YT_RATE_LIMIT_STATE.calls.map((call) => call.key);
  assert.ok(keys.includes("youtube-search:radio"));
  assert.ok(keys.includes("youtube-search:interactive"));
});

test("queue and discovery use independent buckets", async () => {
  reset({
    "youtube-search:queue": 1,
    "youtube-search:discovery": 1,
    "youtube-search:global": 100,
  });
  assert.equal((await search("queue")).status, 200);
  assert.equal((await search("queue")).status, 429);
  assert.equal((await search("discovery")).status, 200);
});

test("omitted or unknown purpose falls back to interactive", async () => {
  reset({
    "youtube-search:interactive": 1,
    "youtube-search:global": 100,
  });
  assert.equal((await search(undefined)).status, 200);
  const second = await search("not-a-purpose");
  assert.equal(second.status, 429);
});

test("the route-wide hard ceiling still blocks mixed workload abuse", async () => {
  reset({
    "youtube-search:radio": 100,
    "youtube-search:interactive": 100,
    "youtube-search:discovery": 100,
    "youtube-search:global": 2,
  });
  assert.equal((await search("radio")).status, 200);
  assert.equal((await search("interactive")).status, 200);
  const blocked = await search("discovery");
  assert.equal(blocked.status, 429);
  const body = await blocked.json();
  assert.equal(body.error?.code || body.code, "RATE_LIMITED");
  assert.equal(blocked.headers.get("retry-after"), "37");
});
