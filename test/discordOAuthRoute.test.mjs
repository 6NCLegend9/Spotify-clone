import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach, after } from "node:test";
import { hashToken } from "../src/utils/tokenHash.mjs";
let user, token, calls;
const oldFetch = globalThis.fetch;
const oldEnv = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_DISCORD_CLIENT_ID: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET };
const query = (value) => ({ then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
globalThis.__apiFixtures = {
  token: () => token, connect() {},
  User: {
    findById() { return query(user); },
    async updateOne(filter, update) { if (filter.sessionVersion !== user.sessionVersion) return { matchedCount: 0 }; Object.assign(user, update.$set); return { matchedCount: 1 }; },
    async findOneAndUpdate(filter, update) {
      if (filter._id !== user._id || filter.sessionVersion !== user.sessionVersion || filter.discordOAuthStateHash !== user.discordOAuthStateHash || !(user.discordOAuthStateExpires > filter.discordOAuthStateExpires.$gt)) return null;
      for (const key of Object.keys(update.$unset)) delete user[key];
      return user;
    },
  },
};
register(new URL("./support/api-loader.mjs", import.meta.url));
const { POST } = await import("../src/app/api/discord/oauth/route.js");
const request = (body, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/discord/oauth", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
beforeEach(() => {
  process.env.NODE_ENV = "development";
  process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = "123456789012345678";
  process.env.DISCORD_CLIENT_SECRET = "fixture-secret";
  user = { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", sessionVersion: 0, isVerified: true };
  token = { id: user._id, sub: user._id, sessionVersion: 0 };
  calls = [];
  globalThis.fetch = async (url) => { calls.push(url); return Response.json(url.endsWith("/rpc") ? { rpc_token: "fixture-rpc" } : { access_token: "fixture-access-token", expires_in: 3600 }); };
});
after(() => { globalThis.fetch = oldFetch; for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
test("anonymous and foreign-origin requests cannot use Discord secrets", async () => {
  token = null;
  assert.equal((await POST(request({ action: "begin" }))).status, 401);
  for (const origin of [null, "https://foreign.example"]) assert.equal((await POST(request({ action: "begin" }, origin))).status, 403);
  assert.deepEqual(calls, []);
});
test("Discord exchange requires a server-issued nonce, rejects replay, and prevents caching", async () => {
  const start = await POST(request({ action: "begin" }));
  const { state } = (await start.json()).data;
  assert.equal(user.discordOAuthStateHash, hashToken(state));
  assert.match(start.headers.get("cache-control"), /no-store/);
  const response = await POST(request({ code: "valid-code-123", state }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.accessToken, "fixture-access-token");
  assert.equal((await POST(request({ code: "valid-code-123", state }))).status, 403);
  assert.equal(calls.length, 2);
});
test("wrong, missing, expired and cross-account exchange nonces are rejected", async () => {
  const { state } = (await (await POST(request({ action: "begin" }))).json()).data;
  assert.equal((await POST(request({ code: "valid-code-123" }))).status, 403);
  assert.equal((await POST(request({ code: "valid-code-123", state: "f".repeat(64) }))).status, 403);
  const owner = user;
  user = { _id: "bbbbbbbbbbbbbbbbbbbbbbbb", isVerified: true, sessionVersion: 0 };
  token = { id: user._id, sub: user._id, sessionVersion: 0 };
  assert.equal((await POST(request({ code: "valid-code-123", state }))).status, 403);
  user = owner;
  token = { id: user._id, sub: user._id, sessionVersion: 0 };
  user.discordOAuthStateExpires = new Date(0);
  assert.equal((await POST(request({ code: "valid-code-123", state }))).status, 403);
  assert.equal(calls.length, 1);
});
