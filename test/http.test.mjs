import assert from "node:assert/strict";
import test from "node:test";
import { invalidateClientCache, requestJson } from "../src/services/http.js";

test("an invalidated in-flight request cannot repopulate the cache", async (context) => {
  invalidateClientCache();
  context.after(() => invalidateClientCache());
  let completeRequest;
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    if (calls === 1) {
      await new Promise((resolve) => { completeRequest = resolve; });
    }
    return Response.json({ version: calls }, { headers: { "cache-control": "public, max-age=300" } });
  });

  const pending = requestJson("/api/genres");
  invalidateClientCache();
  completeRequest();
  await pending;

  assert.deepEqual(await requestJson("/api/genres"), { version: 2 });
  assert.equal(calls, 2);
});

test("account-dependent responses are fetched again after an account switch", async (context) => {
  invalidateClientCache();
  context.after(() => invalidateClientCache());
  let account = "first-account";
  context.mock.method(globalThis, "fetch", async () => Response.json({ account }));
  for (const route of [
    "/api/settings",
    "/api/favourite",
    "/api/userPlaylists",
    "/api/recommendations",
    "/api/followedArtists",
    "/api/genres",
  ]) {
    account = "first-account";
    assert.deepEqual(await requestJson(route), { account });
    account = "second-account";
    assert.deepEqual(await requestJson(route), { account });
  }
});

test("explicitly public responses remain cached", async (context) => {
  invalidateClientCache();
  context.after(() => invalidateClientCache());
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json(
    { genres: ["Pop"] },
    { headers: { "cache-control": "public, max-age=300" } },
  ));
  await requestJson("/api/genres");
  assert.deepEqual(await requestJson("/api/genres"), { genres: ["Pop"] });
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("GET retries return recovered data to the original caller", async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("Failed to fetch");
    if (calls === 2) return Response.json({}, { status: 503 });
    return Response.json({ recovered: true });
  });
  assert.deepEqual(await requestJson("/api/settings"), { recovered: true });
  assert.equal(calls, 3);
});

test("mutations, unauthorized requests and rate limits are not retried", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(requestJson("/api/userPlaylists", { method: "POST", body: { name: "Mix" } }));
  assert.equal(fetchMock.mock.callCount(), 1);
  for (const status of [401, 403, 429]) {
    fetchMock.mock.mockImplementation(async () => Response.json({}, { status }));
    const before = fetchMock.mock.callCount();
    await assert.rejects(requestJson("/api/settings"), { status });
    assert.equal(fetchMock.mock.callCount(), before + 1);
  }
});

test("cancellation during retry backoff does not issue another request", async (context) => {
  const controller = new AbortController();
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    queueMicrotask(() => controller.abort());
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(requestJson("/api/settings", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(fetchMock.mock.callCount(), 1);
});