import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const seed = (name = "Alice", id = "alice") => ({ kind: "artist", term: "Example Artist", owners: [id], ownerNames: [name] });

// Run the real route, validation, ranking and responses. Only account, database,
// rate-limit and provider boundaries are controlled; no external service is used.
function fixture() {
  const state = { roomId: "room-one", allowed: true, searches: 0, roomReads: 0 };
  const modules = new Map();
  const stubs = {
    "@/utils/userAccount": { getAuthenticatedAccount: async () => ({ user: { _id: "member" }, email: "member@example.invalid" }) },
    "@/utils/rateLimit": { isRateLimited: async () => ({ limited: false }) },
    "@/models/JamRoom": { __esModule: true, default: { findOne() {
      state.roomReads++;
      return { select() { return this; }, async lean() { return state.allowed ? { _id: state.roomId } : null; } };
    } } },
    "@/utils/youtubeApi": { youtubeFetch: async () => {
      state.searches++;
      return { ok: true, data: { items: [{ id: { videoId: "abcdefghijk" }, snippet: { title: "Example Artist Official Audio", channelTitle: "Example Artist" } }] } };
    } },
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const loaded = { exports: {} }; modules.set(file, loaded);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const resolve = (name) => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.startsWith("@/") || name.startsWith(".")) {
        let target = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(file), name);
        if (!path.extname(target)) target += existsSync(target + ".js") ? ".js" : ".mjs";
        return load(target);
      }
      return require(name);
    };
    new Function("require", "module", "exports", code)(resolve, loaded, loaded.exports);
    return loaded.exports;
  }
  const route = load(path.join(root, "src/app/api/crowd-radio/route.js"));
  return {
    state,
    async request(seeds = [seed()]) {
      const response = await route.POST(new Request("https://haykasa.example/api/crowd-radio", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "ABCDEF", seeds }),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

test("identical authorized requests reuse the station without another provider search", async () => {
  const f = fixture();
  assert.equal((await f.request()).status, 200);
  const cached = await f.request();
  assert.equal(cached.body.cached, true);
  assert.equal(f.state.searches, 1);
  assert.equal(f.state.roomReads, 2);
});

test("changed listeners cannot receive the cached previous listener's attribution", async () => {
  const f = fixture();
  await f.request();
  const next = await f.request([seed("Bob", "bob")]);
  assert.equal(next.status, 200);
  assert.deepEqual(next.body.tracks[0].owners, ["bob"]);
  assert.deepEqual(next.body.tracks[0].ownerNames, ["Bob"]);
  assert.equal(next.body.tracks[0].reason, "Because Bob listens to Example Artist");
  assert.deepEqual(next.body.seeds[0].owners, ["bob"]);
});

test("a renamed listener does not receive an old cached display name", async () => {
  const f = fixture();
  await f.request();
  const next = await f.request([seed("New Name")]);
  assert.deepEqual(next.body.tracks[0].ownerNames, ["New Name"]);
});

test("reusing a room code cannot reuse another room record's station cache", async () => {
  const f = fixture();
  await f.request();
  f.state.roomId = "room-two";
  const next = await f.request();
  assert.equal(next.body.cached, false);
  assert.equal(f.state.searches, 2);
});

test("cached results preserve the current seed priority order", async () => {
  const f = fixture();
  const artist = seed(), genre = { ...seed(), kind: "genre", term: "Jazz" };
  await f.request([artist, genre]);
  const next = await f.request([genre, artist]);
  assert.deepEqual(next.body.seeds.map(item => item.term), ["Jazz", "Example Artist"]);
});

test("loss of room access is checked before returning a cached station", async () => {
  const f = fixture();
  await f.request();
  f.state.allowed = false;
  const denied = await f.request();
  assert.equal(denied.status, 404);
  assert.equal(denied.body.tracks, undefined);
  assert.equal(f.state.searches, 1);
});
