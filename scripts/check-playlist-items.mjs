import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, beforeEach, after, test } from "node:test";
import mongoose from "mongoose";
import ts from "typescript";
import Playlist from "../src/models/Playlist.js";
import User from "../src/models/User.js";
import UserData from "../src/models/UserData.js";
import * as items from "../src/utils/playlistItems.mjs";
import * as durations from "../src/utils/playlistDuration.mjs";
import * as mutation from "../src/utils/documentMutation.mjs";
import * as themes from "../src/utils/playlistThemes.js";
import * as access from "../src/utils/playlistAccess.mjs";
import * as input from "../src/utils/inputText.mjs";
import * as origin from "../src/utils/trustedOrigin.js";
import * as apiCore from "../src/utils/apiResponseCore.mjs";
import * as diagnostics from "../src/utils/diagnostics.mjs";
import * as music from "../src/utils/officialMusicSearch.mjs";

// No inherited application DB URI is read. Only a disposable loopback replica
// set is accepted; its random database is removed after these actual-route tests.
const uri = process.env.HAYKASA_TEST_MONGO_URI;
assert.ok(uri, "Set HAYKASA_TEST_MONGO_URI to an isolated loopback MongoDB replica set.");
const endpoint = new URL(uri);
assert.equal(endpoint.protocol, "mongodb:");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname));
assert.equal(endpoint.username, "");
assert.equal(endpoint.password, "");
const databaseName = `haykasa_pr42_playlists_${randomUUID().replaceAll("-", "")}`;
const A = "abcdefghijk", B = "lmnopqrstuv", C = "wxyz0123456";
let owner, collaborator, outsider, actor, profile;
let main, songs;

const esmDefault = (value) => ({ __esModule: true, default: value });
function load(file, dependencies = {}) {
  const path = new URL(file, import.meta.url);
  const realRequire = createRequire(path);
  const result = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  }, reportDiagnostics: true });
  assert.equal(compiled.diagnostics?.length || 0, 0, `Syntax errors in ${file}`);
  new Function("require", "module", "exports", compiled.outputText)(
    (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : realRequire(name),
    result, result.exports,
  );
  return result.exports;
}
const api = load("../src/utils/apiResponse.js", {
  "./apiResponseCore.mjs": apiCore, "./diagnostics.mjs": diagnostics,
});
function handlers(model = Playlist) {
  const dependencies = {
    "@/models/Playlist": esmDefault(model), "@/models/User": esmDefault(User),
    "@/models/UserData": esmDefault(UserData), "@/utils/dbconnect": esmDefault(async () => {}),
    "@/utils/apiResponse": api, "@/utils/inputText.mjs": input,
    "@/utils/playlistItems.mjs": items, "@/utils/playlistThemes": themes,
    "@/utils/playlistDuration.mjs": durations, "@/utils/documentMutation.mjs": mutation,
    "@/utils/playlistAccess.mjs": access, "@/utils/trustedOrigin": origin,
    "@/utils/officialMusicSearch.mjs": music,
    "@/utils/sessionAuth": { getSessionUser: async () => actor },
    "@/utils/userAccount": { getAuthenticatedAccount: async () => {
      if (!actor) throw new apiCore.ApiRouteError("UNAUTHORIZED");
      return { user: actor, userData: await UserData.findById(actor.userData) };
    } },
    "@/utils/rateLimit": { isRateLimited: async () => ({ limited: false }) },
    "@/utils/coverValidation": { validatedCover: async (value) => value || "" },
    "@/utils/youtubeApi": { youtubeFetch: async () => ({ ok: true, data: { items: [] } }) },
  };
  return {
    main: load("../src/app/api/userPlaylists/route.js", dependencies),
    songs: load("../src/app/api/userPlaylists/songs/route.js", dependencies),
    likes: load("../src/app/api/userPlaylists/like/route.js", dependencies),
  };
}
function request(method, path, body, headers = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method, headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const songRequest = (method, playlist, body) => request(method, "/api/userPlaylists/songs", {
  playlistID: String(playlist._id), ...body,
});
async function fixture(values = {}) {
  return Playlist.create({ name: "QA playlist", user: owner._id, songs: [], ...values });
}
async function read(response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}

// Both CAS reads return the same real Mongo state before either update starts.
// All writes/validators/retries still execute against the pinned SDK/server.
function concurrentReads() {
  let count = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  return new Proxy(Playlist, { get(target, key) {
    if (key === "findById") return (...args) => {
      const query = target.findById(...args);
      const lean = query.lean.bind(query);
      query.lean = async (...options) => {
        const current = await lean(...options);
        if (count < 2) {
          count += 1;
          if (count === 2) release();
          await barrier;
        }
        return current;
      };
      return query;
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
function beforeFirstUpdate(callback) {
  let first = true;
  return new Proxy(Playlist, { get(target, key) {
    if (key === "findOneAndUpdate") return (...args) => ({ lean: async () => {
      if (first) { first = false; await callback(); }
      return target.findOneAndUpdate(...args).lean();
    } });
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

before(async () => {
  await mongoose.connect(uri, { dbName: databaseName, serverSelectionTimeoutMS: 10_000 });
  assert.ok((await mongoose.connection.db.admin().command({ hello: 1 })).setName, "Transactions require a replica set.");
  ({ main, songs } = handlers());
});
beforeEach(async () => {
  await Promise.all([Playlist.deleteMany({}), User.deleteMany({}), UserData.deleteMany({})]);
  profile = await UserData.create({ genres: ["Chill"] });
  [owner, collaborator, outsider] = await User.create([
    { userName: "Owner", email: "owner@example.test", userData: profile._id },
    { userName: "Collaborator", email: "collaborator@example.test" },
    { userName: "Outsider", email: "outsider@example.test" },
  ]);
  actor = owner;
});
after(async () => {
  if (!mongoose.connection.db) return;
  try {
    assert.match(mongoose.connection.name, /^haykasa_pr42_playlists_[a-f0-9]{32}$/);
    await mongoose.connection.dropDatabase();
  } finally { await mongoose.disconnect(); }
});

test("legacy and mismatched data have stable occurrence IDs without writing on reads", async () => {
  const date = new Date("2026-10-01T09:00:00Z");
  const playlist = await fixture({ songs: [A, A, B], songAddedAt: { [A]: date }, items: [{ entryId: randomUUID(), id: C }] });
  const before = await Playlist.findById(playlist._id).lean();
  const first = await read(await songs.GET(request("GET", `/api/userPlaylists/songs?playlist=${playlist._id}`)));
  const second = await read(await songs.GET(request("GET", `/api/userPlaylists/songs?playlist=${playlist._id}`)));
  assert.deepEqual(first.data.items, second.data.items);
  assert.equal(new Set(first.data.items.map((item) => item.entryId)).size, 3);
  assert.equal(first.data.items[0].addedAt, date.toISOString());
  assert.equal(first.data.items[2].addedAt, null);
  assert.deepEqual(await Playlist.findById(playlist._id).lean(), before);
});

test("all canonical mutation DTOs retain public creator/collaborator details without email or credentials", async () => {
  const safePeople = playlist => {
    assert.equal(playlist.user.userName, "Owner");
    assert.equal(String(playlist.user._id), String(owner._id));
    assert.deepEqual(Object.keys(playlist.user).sort(), ["_id", "imageUrl", "userName"]);
    for (const person of playlist.collaborators) {
      assert.equal(person.userName, "Collaborator");
      assert.deepEqual(Object.keys(person).sort(), ["_id", "imageUrl", "userName"]);
    }
  };
  const created = await read(await main.POST(request("POST", "/api/userPlaylists", { name: "Public DTO test" })));
  safePeople(created.data.playlist);
  const playlist = await fixture({ songs: [A, B], collaborators: [collaborator._id] });
  const added = await read(await songs.POST(songRequest("POST", playlist, { song: C })));
  safePeople(added.data.playlist);
  const moved = await read(await songs.PATCH(songRequest("PATCH", playlist, {
    entryId: added.data.playlist.items[0].entryId, beforeEntryId: null, expectedRevision: added.data.playlist.revision,
  })));
  safePeople(moved.data.playlist);
  const removed = await read(await songs.DELETE(songRequest("DELETE", playlist, {
    entryId: moved.data.playlist.items[0].entryId, expectedRevision: moved.data.playlist.revision,
  })));
  safePeople(removed.playlist);
  const liked = await read(await handlers().likes.POST(request("POST", "/api/userPlaylists/like", { playlistId: String(playlist._id), liked: true })));
  safePeople(liked.data); assert.equal(liked.data.liked, true);
});

test("default duplicate detection is a no-op; explicit duplicates and request replay retain individual occurrences", async () => {
  const playlist = await fixture();
  const requestId = randomUUID();
  let body = await read(await songs.POST(songRequest("POST", playlist, { song: A, duration: 183, requestId })));
  assert.equal(body.added, true);
  const first = body.data.playlist;
  assert.deepEqual(first.songs, [A]);
  assert.equal(first.items[0].entryId, requestId);
  assert.equal(first.songDurations[A], 183);
  body = await read(await songs.POST(songRequest("POST", playlist, { song: A })));
  assert.equal(body.duplicate, true); assert.equal(body.added, false);
  assert.equal(body.data.playlist.revision, first.revision);
  const replay = await read(await songs.POST(songRequest("POST", playlist, { song: A, requestId: requestId.toUpperCase(), allowDuplicate: true })));
  assert.equal(replay.added, false); assert.equal(replay.data.playlist.items.length, 1);
  await read(await songs.POST(songRequest("POST", playlist, { song: B, requestId })), 409);
  body = await read(await songs.POST(songRequest("POST", playlist, { song: A, allowDuplicate: true })));
  assert.equal(body.data.playlist.items.length, 2);
  assert.notEqual(body.data.playlist.items[0].entryId, body.data.playlist.items[1].entryId);
});

test("targeted remove keeps other duplicates; legacy removal retains its all-matching semantics and array response", async () => {
  const playlist = await fixture();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const requestId of ids) await read(await songs.POST(songRequest("POST", playlist, { song: A, allowDuplicate: true, requestId })));
  const removed = await read(await songs.DELETE(songRequest("DELETE", playlist, { entryId: ids[1], song: A })));
  assert.deepEqual(removed.data, [A, A]);
  assert.deepEqual(removed.playlist.items.map((item) => item.entryId), [ids[0], ids[2]]);
  await read(await songs.DELETE(songRequest("DELETE", playlist, { entryId: ids[0], song: B })), 409);
  const legacy = await read(await songs.DELETE(songRequest("DELETE", playlist, { song: A })));
  assert.deepEqual(legacy.data, []); assert.deepEqual(legacy.playlist.items, []);
  assert.deepEqual(legacy.playlist.songAddedAt, {});
});

test("reordering moves one occurrence, keeps dates, and rejects stale moves without losing concurrent additions", async () => {
  const playlist = await fixture({ songs: [A, A, B] });
  const initial = themes.serializePlaylist(playlist, owner._id);
  const moved = await read(await songs.PATCH(songRequest("PATCH", playlist, {
    entryId: initial.items[0].entryId, beforeEntryId: null, expectedRevision: initial.revision,
  })));
  assert.deepEqual(moved.data.playlist.items.map((item) => item.entryId), [initial.items[1].entryId, initial.items[2].entryId, initial.items[0].entryId]);
  await read(await songs.POST(songRequest("POST", playlist, { song: C })));
  await read(await songs.PATCH(songRequest("PATCH", playlist, {
    entryId: initial.items[0].entryId, beforeEntryId: null, expectedRevision: moved.data.playlist.revision,
  })), 409);
  assert.deepEqual((await Playlist.findById(playlist._id).lean()).songs, [A, B, A, C]);
  await read(await songs.PATCH(songRequest("PATCH", playlist, { entryId: initial.items[0].entryId, beforeEntryId: null })), 400);
});

test("concurrent real adds and disjoint metadata edits rebase without dropped writes or VersionError 500s", async () => {
  const playlist = await fixture();
  const concurrent = handlers(concurrentReads());
  const additions = await Promise.all([A, B].map((song) => concurrent.songs.POST(songRequest("POST", playlist, { song }))));
  for (const response of additions) await read(response);
  assert.deepEqual(new Set((await Playlist.findById(playlist._id)).songs), new Set([A, B]));
  const edits = handlers(concurrentReads());
  const changed = await Promise.all([
    edits.main.PATCH(request("PATCH", "/api/userPlaylists", { playlistId: String(playlist._id), action: "name", value: "Renamed" })),
    edits.main.PATCH(request("PATCH", "/api/userPlaylists", { playlistId: String(playlist._id), action: "visibility", value: "public" })),
  ]);
  for (const response of changed) await read(response);
  const saved = await Playlist.findById(playlist._id);
  assert.equal(saved.name, "Renamed"); assert.equal(saved.visibility, "public");
  assert.equal(saved.items.length, 2);
});

test("concurrent request replay adds exactly once and concurrent capacity checks cannot exceed 500", async () => {
  const playlist = await fixture();
  const duplicate = handlers(concurrentReads());
  const requestId = randomUUID();
  for (const response of await Promise.all([0, 1].map(() => duplicate.songs.POST(songRequest("POST", playlist, { song: A, requestId, allowDuplicate: true }))))) await read(response);
  assert.equal((await Playlist.findById(playlist._id)).items.length, 1);
  const full = await fixture({ songs: Array(499).fill(A) });
  const concurrent = handlers(concurrentReads());
  const responses = await Promise.all([B, C].map((song) => concurrent.songs.POST(songRequest("POST", full, { song }))));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
  const saved = await Playlist.findById(full._id);
  assert.equal(saved.songs.length, 500); assert.equal(saved.items.length, 500);
});

test("an add during a reorder CAS returns 409, and an add during metadata CAS is retained", async () => {
  const playlist = await fixture({ songs: [A, B] });
  const initial = themes.serializePlaylist(playlist, owner._id);
  const reordered = handlers(beforeFirstUpdate(async () => {
    await read(await songs.POST(songRequest("POST", playlist, { song: C })));
  }));
  await read(await reordered.songs.PATCH(songRequest("PATCH", playlist, {
    entryId: initial.items[0].entryId, beforeEntryId: null, expectedRevision: initial.revision,
  })), 409);
  assert.deepEqual((await Playlist.findById(playlist._id)).songs, [A, B, C]);
  const edited = handlers(beforeFirstUpdate(async () => {
    await read(await songs.POST(songRequest("POST", playlist, { song: A, allowDuplicate: true })));
  }));
  const result = await read(await edited.main.PATCH(request("PATCH", "/api/userPlaylists", {
    playlistId: String(playlist._id), action: "name", value: "Concurrent name",
  })));
  assert.equal(result.data.playlist.name, "Concurrent name");
  assert.deepEqual(result.data.playlist.songs, [A, B, C, A]);
  assert.equal(new Set(result.data.playlist.items.map((item) => item.entryId)).size, 4);
});

test("role revocation between read and CAS prevents a former collaborator from adding", async () => {
  const playlist = await fixture({ collaborators: [collaborator._id] });
  actor = collaborator;
  const guarded = handlers(beforeFirstUpdate(async () => {
    await Playlist.updateOne({ _id: playlist._id }, { $set: { collaborators: [] } });
  }));
  await read(await guarded.songs.POST(songRequest("POST", playlist, { song: A })), 403);
  assert.deepEqual((await Playlist.findById(playlist._id)).songs, []);
});

test("private access, collaborator permissions, public readers and unauthenticated mutations keep their boundaries", async () => {
  const playlist = await fixture({ songs: [A], collaborators: [collaborator._id] });
  actor = outsider;
  await read(await songs.GET(request("GET", `/api/userPlaylists/songs?playlist=${playlist._id}`)), 404);
  await read(await songs.POST(songRequest("POST", playlist, { song: B })), 403);
  actor = collaborator;
  await read(await songs.GET(request("GET", `/api/userPlaylists/songs?playlist=${playlist._id}`)));
  await read(await songs.POST(songRequest("POST", playlist, { song: B })));
  await read(await main.PATCH(request("PATCH", "/api/userPlaylists", { playlistId: String(playlist._id), action: "visibility", value: "public" })), 403);
  await Playlist.updateOne({ _id: playlist._id }, { $set: { visibility: "public" } });
  actor = null;
  await read(await songs.GET(request("GET", `/api/userPlaylists/songs?playlist=${playlist._id}`)));
  await read(await songs.POST(songRequest("POST", playlist, { song: C })), 401);
  actor = owner;
  await read(await songs.POST(request("POST", "/api/userPlaylists/songs", { playlistID: String(playlist._id), song: C }, { Origin: "https://untrusted.example" })), 403);
});

test("valid constructor-shaped IDs do not read inherited properties or crash Mongoose maps", async () => {
  const playlist = await fixture();
  const added = await read(await songs.POST(songRequest("POST", playlist, { song: "constructor", duration: 212 })));
  assert.deepEqual(added.data.playlist.songs, ["constructor"]);
  assert.ok(added.data.playlist.items[0].addedAt);
  assert.equal(Object.hasOwn(added.data.playlist.songAddedAt, "constructor"), false);
  assert.equal(Object.hasOwn(added.data.playlist.songDurations, "constructor"), false);
  const schemaResult = new Playlist({ name: "Constructor", songs: ["constructor"], ...items.playlistItemChanges({}, added.data.playlist.items) }).validateSync();
  assert.equal(schemaResult, undefined);
});

test("real transactional creation uses explicit category and deletion removes all library references", async () => {
  const created = await read(await main.POST(request("POST", "/api/userPlaylists", { name: "Chill Mix", category: "Rock", songs: [A, B], autoFill: false })));
  const playlist = created.data.playlist;
  assert.equal(playlist.category, "Rock"); assert.equal(playlist.items.length, 2);
  assert.ok(playlist.items.every((item) => item.addedAt));
  assert.ok((await UserData.findById(profile._id)).playlists.some((id) => String(id) === playlist._id));
  await UserData.create({ likedPlaylists: [playlist._id] });
  await read(await main.DELETE(request("DELETE", "/api/userPlaylists", { playlistId: playlist._id })));
  assert.equal(await Playlist.findById(playlist._id), null);
  assert.equal(await UserData.countDocuments({ $or: [{ playlists: playlist._id }, { likedPlaylists: playlist._id }] }), 0);
});

test("concurrent transactional creation at the library cap leaves one committed playlist and no orphan", async () => {
  await UserData.updateOne({ _id: profile._id }, { $set: { playlists: Array.from({ length: 199 }, () => new mongoose.Types.ObjectId()) } });
  const responses = await Promise.all(["First", "Second"].map((name) => main.POST(request("POST", "/api/userPlaylists", { name }))));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
  assert.equal((await UserData.findById(profile._id)).playlists.length, 200);
  assert.equal(await Playlist.countDocuments(), 1);
});

test("the actual schema enforces item capacity and unique occurrence IDs", () => {
  const entryId = randomUUID();
  assert.ok(new Playlist({ name: "Too many", songs: Array(501).fill(A) }).validateSync());
  assert.ok(new Playlist({ name: "Too many", items: Array.from({ length: 501 }, () => ({ id: A, entryId: randomUUID() })) }).validateSync());
  assert.ok(new Playlist({ name: "Repeated identity", items: [{ id: A, entryId }, { id: A, entryId }] }).validateSync());
});

test("details without a cover do not overwrite a concurrently changed cover", async () => {
  const playlist = await fixture({ coverImage: "old-cover" });
  const guarded = handlers(beforeFirstUpdate(async () => {
    await Playlist.updateOne({ _id: playlist._id }, { $set: { coverImage: "new-cover" }, $inc: { __v: 1 } });
  }));
  const result = await read(await guarded.main.PATCH(request("PATCH", "/api/userPlaylists", {
    playlistId: String(playlist._id), action: "details", value: { name: "New name", description: "New description" },
  })));
  assert.equal(result.data.playlist.coverImage, "new-cover");
});

test("invalid boundary and command payloads are rejected without mutating the playlist", async () => {
  const playlist = await fixture();
  for (const body of [
    { song: "" }, { song: "A".repeat(10000) }, { song: A, duration: -1 }, { song: A, duration: "123" },
    { song: A, duration: null }, { song: A, duration: 1e99 }, { song: A, allowDuplicate: "true" },
    { song: A, requestId: "not-a-uuid" },
  ]) await read(await songs.POST(songRequest("POST", playlist, body)), 400);
  await read(await songs.DELETE(songRequest("DELETE", playlist, { song: A, expectedRevision: -1 })), 400);
  await read(await songs.PATCH(songRequest("PATCH", playlist, { entryId: "missing", beforeEntryId: null, expectedRevision: 0 })), 400);
  assert.deepEqual((await Playlist.findById(playlist._id)).songs, []);
});
