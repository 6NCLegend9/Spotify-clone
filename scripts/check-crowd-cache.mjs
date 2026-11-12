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
  const state = { roomId: "room-one", allowed: true, searches: 0, roomReads: 0, members: ["member", "alice", "bob", "genre"], user: { _id: "alice", userName: "Alice" }, userData: { genres: ["Soul"], followedArtists: ["Saved Artist"] } };
  const modules = new Map();
  const stubs = {
    "@/utils/userAccount": { getAuthenticatedAccount: async () => ({ user: state.user, userData: state.userData, email: "member@example.invalid" }) },
    "./authToken": { authSecret: () => "crowd-local-test-secret-never-production" },
    "@/utils/rateLimit": { isRateLimited: async () => ({ limited: false }) },
    "@/models/JamRoom": { __esModule: true, default: { findOne() {
      state.roomReads++;
      return { select() { return this; }, async lean() { return state.allowed ? { _id: state.roomId, members: state.members } : null; } };
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
  const signing = load(path.join(root, "src/utils/jamSigning.js"));
  const profileRoute = load(path.join(root, "src/app/api/crowd-profile/route.js"));
  const attest = (seeds) => seeds.map(seed => signing.signJamEvent({ roomId: state.roomId, event: "crowd-profile", senderId: seed.owners[0], role: "member", payload: { name: seed.ownerNames[0], artists: seed.kind === "artist" ? [seed.term] : [], genres: seed.kind === "genre" ? [seed.term] : [] } }));
  const raw = async (body, target = route, origin = "http://localhost:3000") => {
    const response = await target.POST(new Request("http://localhost:3000/api/crowd-radio", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  return {
    state, attest, raw, profile: (body) => raw(body, profileRoute),
    async request(seeds = [seed()]) {
      return raw({ code: "ABCDEF", profiles: attest(seeds) });
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
  const artist = seed(), genre = { ...seed("Genre", "genre"), kind: "genre", term: "Jazz" };
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


test("client seeds alone are rejected before provider access", async () => {
  const f = fixture();
  assert.equal((await f.raw({ code: "ABCDEF", seeds: [seed()] })).status, 400);
  assert.equal(f.state.searches, 0);
});
test("profile endpoint stamps only authenticated account and saved tastes", async () => {
  const f = fixture();
  const result = await f.profile({ code: "ABCDEF", senderId: "bob", name: "Mallory", artists: ["Injected"] });
  assert.equal(result.status, 200);
  const signed = JSON.parse(result.body.envelope.message);
  assert.equal(signed.senderId, "alice"); assert.equal(signed.payload.name, "Alice");
  assert.deepEqual(signed.payload.artists, ["Saved Artist"]);
  assert.match(result.headers.get("cache-control"), /no-store/);
  const station = await f.raw({ code: "ABCDEF", profiles: [result.body.envelope], seeds: [seed("Mallory")] });
  assert.equal(station.status, 200); assert.equal(station.body.seeds[0].term, "Saved Artist");
});
test("profile issuance requires current membership", async () => {
  const f = fixture(); f.state.allowed = false;
  assert.equal((await f.profile({ code: "ABCDEF" })).status, 404);
});
test("tampered profile cannot search or return a cached station", async () => {
  const f = fixture(); await f.request();
  const profiles = f.attest([seed()]); profiles[0].message = profiles[0].message.replace("Alice", "Mallory");
  assert.equal((await f.raw({ code: "ABCDEF", profiles })).status, 400);
  assert.equal(f.state.searches, 1);
});
test("departed member is removed before cached attribution is returned", async () => {
  const f = fixture(); const profiles = f.attest([seed()]); await f.request();
  f.state.members = ["member", "bob"];
  assert.equal((await f.raw({ code: "ABCDEF", profiles })).status, 400);
  assert.equal(f.state.searches, 1);
});
test("cross-origin station request is denied before any search", async () => {
  const f = fixture();
  assert.equal((await f.raw({ code: "ABCDEF", profiles: f.attest([seed()]) }, undefined, "https://attacker.invalid")).status, 403);
  assert.equal(f.state.searches, 0);
});
