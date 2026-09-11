import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import { hashToken } from "../src/utils/tokenHash.mjs";
import { sessionIdentity } from "../src/utils/sessionIdentity.mjs";
import nextAuthSession from "../node_modules/next-auth/core/routes/session.js";

const ownerId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const readerId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const playlistId = "cccccccccccccccccccccccc";
const resetToken = "d".repeat(64);
const password = "fixture-password-123";
const passwordHash = await bcrypt.hash(password, 4);
let state;

function query(value) {
  return {
    select() { return this; },
    session() { return this; },
    populate() { return this; },
    lean() { return Promise.resolve(value); },
    sort() { return Promise.resolve(value); },
    then(fulfilled, rejected) { return Promise.resolve(value).then(fulfilled, rejected); },
  };
}

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$and") return value.every((entry) => matches(document, entry));
    if (key === "$or") return value.some((entry) => matches(document, entry));
    const actual = key.split(".").reduce((entry, segment) => entry?.[segment], document);
    if (value && typeof value === "object" && "$exists" in value) return (actual !== undefined) === value.$exists;
    if (value && typeof value === "object" && "$eq" in value) return JSON.stringify(actual) === JSON.stringify(value.$eq);
    if (value && typeof value === "object" && "$ne" in value) return actual !== value.$ne;
    if (value && typeof value === "object" && "$in" in value) return value.$in.map(String).includes(String(actual));
    if (Array.isArray(actual)) return actual.map(String).includes(String(value));
    return String(actual) === String(value);
  });
}

globalThis.__apiFixtures = {
  token: () => state.token,
  connect() { state.connections += 1; if (state.databaseError) throw new Error("Fixture database unavailable"); },
  mail() { state.mails += 1; },
  User: {
    db: {
      async transaction(callback) {
        const snapshot = JSON.stringify(state);
        try { return await callback({ fixture: true }); }
        catch (error) { state = JSON.parse(snapshot); throw error; }
      },
    },
    findById(id) { state.userReads += 1; return query(state.users.find((user) => user._id === id) || null); },
    findOne(filter) { state.userReads += 1; return query(state.users.find((user) => matches(user, filter)) || null); },
    findOneAndUpdate(filter, update) {
      if (filter.resetPasswordToken) {
        const user = state.users.find((entry) => entry.resetPasswordToken === filter.resetPasswordToken
          && entry.resetPasswordExpires > filter.resetPasswordExpires.$gt);
        if (!user) return query(null);
        Object.assign(user, update.$set);
        user.sessionVersion = (user.sessionVersion ?? 0) + (update.$inc?.sessionVersion || 0);
        state.writes += 1;
        return query(user);
      }
      throw new Error("Unexpected fixture User update");
    },
    updateOne(filter, update) {
      const user = state.users.find((entry) => matches(entry, filter));
      if (!user) return Promise.resolve({ matchedCount: 0 });
      if (update.$inc?.sessionVersion) user.sessionVersion = (user.sessionVersion ?? 0) + update.$inc.sessionVersion;
      state.writes += 1;
      return Promise.resolve({ matchedCount: 1 });
    },
    findByIdAndDelete() { state.writes += 1; throw new Error("Deletion should not run for a rejected token"); },
    async deleteOne(filter) { state.users = state.users.filter((user) => !matches(user, filter)); },
  },
  UserData: {
    findById(id) { state.dataReads += 1; return query(state.profiles[id]); },
    findByIdAndUpdate() { state.writes += 1; return query({ settings: {}, language: [] }); },
    findOneAndUpdate(filter, update) {
      const profile = state.profiles[filter._id];
      if (!profile || !matches(profile, filter)) return query(null);
      Object.assign(profile, structuredClone(update.$set));
      profile.__v = (profile.__v || 0) + (update.$inc?.__v || 0);
      state.writes += 1;
      return query(structuredClone(profile));
    },
    async updateOne(filter, update) {
      if (state.likeFailure) throw new Error("Fixture like failure");
      Object.assign(state.profiles[filter._id], structuredClone(update.$set));
      state.writes += 1;
    },
    async updateMany(_filter, update) {
      for (const profile of Object.values(state.profiles)) {
        for (const [field, condition] of Object.entries(update.$pull)) {
          profile[field] = (profile[field] || []).filter((id) => !condition.$in.includes(id));
        }
      }
    },
    async deleteOne(filter) { delete state.profiles[filter._id]; },
  },
  Playlist: {
    async create(entries) {
      const values = entries.map((entry, index) => ({ ...entry, _id: `ddddddddddddddddddddddd${index}`, visibility: "private", likedBy: [], collaborators: [] }));
      state.playlists.push(...values);
      return values;
    },
    find(filter) { state.playlistQueries.push(filter); return query(state.playlists.filter((playlist) => matches(playlist, filter))); },
    findById(id) { return query(state.playlists.find((playlist) => playlist._id === id) || null); },
    findOneAndUpdate(filter, update) {
      const current = state.playlists.find((playlist) => playlist._id === filter._id);
      if (update.$addToSet) current.likedBy = [...new Set([...(current.likedBy || []), update.$addToSet.likedBy])];
      if (update.$pull) current.likedBy = current.likedBy.filter((id) => id !== update.$pull.likedBy);
      state.writes += 1;
      return query(current);
    },
    async updateMany(_filter, update) {
      for (const playlist of state.playlists) {
        for (const [field, id] of Object.entries(update.$pull)) {
          playlist[field] = (playlist[field] || []).filter((entry) => entry !== id);
        }
      }
    },
    async deleteMany(filter) { state.playlists = state.playlists.filter((playlist) => !matches(playlist, filter)); },
    async deleteOne(filter) { state.playlists = state.playlists.filter((playlist) => !matches(playlist, filter)); },
  },
  Genre: {
    find() { return query([]); },
    async deleteMany() { if (state.deletionFailure) throw new Error("Fixture deletion failure"); },
  },
};

register(new URL("./support/api-loader.mjs", import.meta.url));

const { authOptions } = await import("../src/utils/authOptions.js");
const sessionAuth = await import("../src/utils/sessionAuth.js");
const resetRoute = await import("../src/app/api/forgotPassword/route.js");
const libraryRoute = await import("../src/app/api/userPlaylists/route.js");
const songsRoute = await import("../src/app/api/userPlaylists/songs/route.js");
const likeRoute = await import("../src/app/api/userPlaylists/like/route.js");
const settingsRoute = await import("../src/app/api/settings/route.js");
const languageRoute = await import("../src/app/api/language/route.js");
const exportRoute = await import("../src/app/api/account/export/route.js");
const deleteRoute = await import("../src/app/api/deleteAccount/route.js");
const profileRoute = await import("../src/app/api/userInfo/route.js");
const genresRoute = await import("../src/app/api/genres/route.js");
const tagsRoute = await import("../src/app/api/tags/route.js");
const sessionsRoute = await import("../src/app/api/account/sessions/route.js");
const eventsRoute = await import("../src/app/api/playEvent/route.js");

function request(path, method = "GET", body) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  const owner = {
    _id: ownerId, email: "account@example.test", userName: "Owner", isVerified: true,
    userData: "owner-data", sessionVersion: 0, password: passwordHash,
    resetPasswordToken: hashToken(resetToken), resetPasswordExpires: Date.now() + 60_000,
  };
  const reader = { _id: readerId, email: "reader@example.test", userName: "Reader", isVerified: true, userData: "reader-data", sessionVersion: 0 };
  state = {
    users: [owner, reader], token: sessionIdentity(owner), connections: 0, userReads: 0,
    dataReads: 0, writes: 0, mails: 0, playlistQueries: [], databaseError: false,
    profiles: {
      "owner-data": { _id: "owner-data", playlists: [playlistId], likedPlaylists: [], settings: {} },
      "reader-data": { _id: "reader-data", playlists: [], likedPlaylists: [playlistId], settings: {} },
    },
    playlists: [{
      _id: playlistId, name: "Shared playlist", user: ownerId, collaborators: [], visibility: "public",
      songs: ["abcdefghijk"], likedBy: [readerId],
      async save() { state.writes += 1; },
      async populate() { return this; },
    }],
  };
});

test("real credentials and Google JWT callbacks issue immutable claims and never upgrade an old token", async () => {
  const credentialsUser = await authOptions.providers[0].authorize({ email: state.users[0].email, password });
  const token = await authOptions.callbacks.jwt({ token: {}, user: credentialsUser, account: { provider: "credentials" } });
  assert.equal(token.id, ownerId);
  assert.equal(token.sub, ownerId);
  assert.equal(token.sessionVersion, 0);
  const google = await authOptions.callbacks.jwt({ token: {}, user: { email: state.users[1].email, id: "google-provider-id" }, account: { provider: "google" } });
  assert.equal(google.id, readerId);
  assert.equal(google.sub, readerId);
  state.users[0].sessionVersion = 1;
  await assert.rejects(authOptions.callbacks.jwt({ token }), /Session is no longer valid/);
  await assert.rejects(authOptions.callbacks.jwt({ token: { email: state.users[0].email } }), /Session is no longer valid/);
  assert.equal(token.sessionVersion, 0);
});

test("password-reset handler consumes its token once and revokes old sessions atomically", async () => {
  const oldToken = state.token;
  const body = { token: resetToken, password: "new-fixture-password", confirmPassword: "new-fixture-password" };
  const responses = await Promise.all([
    resetRoute.PUT(request("/api/forgotPassword", "PUT", body)),
    resetRoute.PUT(request("/api/forgotPassword", "PUT", body)),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
  assert.equal(state.users[0].sessionVersion, 1);
  assert.equal(state.users[0].resetPasswordToken, null);
  assert.equal(await bcrypt.compare(body.password, state.users[0].password), true);
  assert.equal(await sessionAuth.resolveSessionUser(oldToken), null);
  assert.equal((await sessionAuth.resolveSessionUser(sessionIdentity(state.users[0])))._id, ownerId);
});

test("NextAuth clears the session cookie when the application rejects a revoked JWT", async () => {
  state.users[0].sessionVersion = 1;
  let cleaned = 0;
  let encoded = 0;
  const response = await nextAuthSession.default({
    options: {
      session: { strategy: "jwt", maxAge: 3600 }, callbacks: authOptions.callbacks,
      jwt: { decode: async () => state.token, encode: async () => { encoded += 1; return "unused"; } },
      logger: { error() {} }, events: {},
    },
    sessionStore: { value: "fixture-cookie", clean() { cleaned += 1; return [{ name: "session", value: "" }]; } },
  });
  assert.equal(cleaned, 1);
  assert.equal(encoded, 0);
  assert.deepEqual(response.body, {});
});

test("all account routes reject stale sessions before reading personal data or mutating it", async () => {
  state.users[0].sessionVersion = 1;
  for (const route of [libraryRoute, exportRoute, profileRoute]) {
    assert.equal((await route.GET(request("/api/test"))).status, 401);
  }
  assert.equal((await deleteRoute.POST(request("/api/deleteAccount", "POST", {}))).status, 401);
  assert.equal((await songsRoute.POST(request("/api/userPlaylists/songs", "POST", { playlistID: playlistId, song: "abcdefghijk" }))).status, 401);
  assert.equal((await likeRoute.POST(request("/api/userPlaylists/like", "POST", { playlistId }))).status, 401);
  assert.equal((await genresRoute.POST(request("/api/genres", "POST", {}))).status, 401);
  assert.equal((await tagsRoute.POST(request("/api/tags", "POST", {}))).status, 401);
  for (const route of [settingsRoute, languageRoute]) {
    const response = await route.GET(request("/api/test"));
    assert.equal((await response.json()).authenticated, false);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await route.PUT(request("/api/test", "PUT", {}))).status, 401);
  }
  assert.equal(state.writes, 0);
  assert.equal(state.dataReads, 0);
  assert.equal(state.mails, 0);
});

test("deleted and same-email re-created users cannot inherit an old API session", async () => {
  state.users[0] = { ...state.users[0], _id: "eeeeeeeeeeeeeeeeeeeeeeee" };
  assert.equal((await profileRoute.GET(request("/api/userInfo"))).status, 401);
  assert.equal((await exportRoute.GET(request("/api/account/export"))).status, 401);
  assert.equal((await deleteRoute.POST(request("/api/deleteAccount", "POST", {}))).status, 401);
  assert.equal(state.writes, 0);
});

test("sign out all devices requires same-origin confirmation and invalidates every old token", async () => {
  const crossOrigin = new Request("http://localhost:3000/api/account/sessions", {
    method: "POST", headers: { Origin: "https://untrusted.example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  });
  assert.equal((await sessionsRoute.POST(crossOrigin)).status, 403);
  assert.equal((await sessionsRoute.POST(request("/api/account/sessions", "POST", {}))).status, 400);
  assert.equal(state.writes, 0);
  const oldToken = state.token;
  assert.equal((await sessionsRoute.POST(request("/api/account/sessions", "POST", { confirm: true }))).status, 200);
  assert.equal(state.users[0].sessionVersion, 1);
  assert.equal(await sessionAuth.resolveSessionUser(oldToken), null);
  assert.equal((await sessionsRoute.POST(request("/api/account/sessions", "POST", { confirm: true }))).status, 401);
  assert.equal(state.writes, 1);
});

test("library and detail endpoints enforce privacy after a public playlist becomes private", async () => {
  state.token = sessionIdentity(state.users[1]);
  let response = await libraryRoute.GET(request("/api/userPlaylists"));
  assert.equal((await response.json()).data.playlists.length, 1);
  state.token = sessionIdentity(state.users[0]);
  assert.equal((await libraryRoute.PATCH(request("/api/userPlaylists", "PATCH", { playlistId, action: "visibility", value: "private" }))).status, 200);
  state.token = sessionIdentity(state.users[1]);
  response = await libraryRoute.GET(request("/api/userPlaylists"));
  assert.deepEqual((await response.json()).data.playlists, []);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await songsRoute.GET(request(`/api/userPlaylists/songs?playlist=${playlistId}`))).status, 403);
  assert.equal((await likeRoute.POST(request("/api/userPlaylists/like", "POST", { playlistId }))).status, 403);
  state.playlists[0].collaborators = [readerId];
  assert.equal((await songsRoute.GET(request(`/api/userPlaylists/songs?playlist=${playlistId}`))).status, 200);
  state.token = null;
  assert.equal((await songsRoute.GET(request(`/api/userPlaylists/songs?playlist=${playlistId}`))).status, 401);
});

test("database errors fail closed without refreshing or mutating account state", async () => {
  state.databaseError = true;
  await assert.rejects(sessionAuth.getSessionUser(request("/api/test")), /Fixture database unavailable/);
  await assert.rejects(authOptions.callbacks.jwt({ token: state.token }), /Fixture database unavailable/);
  assert.equal(state.writes, 0);
});

test("export includes owned preferences and activity but excludes credentials and other user identities", async () => {
  Object.assign(state.profiles["owner-data"], {
    completedPlays: ["abcdefghijk"], skippedTracks: ["lmnopqrstuv"], notInterested: ["12345678901"],
    snoozedTracks: ["abcdefghijk"], followedArtistsMeta: [{ name: "Artist", channelId: "channel" }],
  });
  const response = await exportRoute.GET(request("/api/account/export"));
  const body = await response.json();
  assert.equal(body.formatVersion, 2);
  assert.deepEqual(body.profile.completedPlays, ["abcdefghijk"]);
  assert.deepEqual(body.profile.notInterested, ["12345678901"]);
  assert.equal(body.profile.followedArtistsMeta[0].name, "Artist");
  assert.equal(JSON.stringify(body).includes(passwordHash), false);
  assert.equal(body.account.sessionVersion, undefined);
  assert.equal(body.playlists[0].likedBy, undefined);
});

test("confirmed deletion removes owned data and relationship references in one transaction", async () => {
  state.playlists.push({ _id: "external", user: readerId, collaborators: [ownerId], likedBy: [ownerId, readerId] });
  assert.equal((await deleteRoute.POST(request("/api/deleteAccount", "POST", {}))).status, 400);
  const result = await deleteRoute.POST(request("/api/deleteAccount", "POST", { confirm: "DELETE" }));
  assert.equal(result.status, 200);
  assert.equal(state.users.some((user) => user._id === ownerId), false);
  assert.equal(state.profiles["owner-data"], undefined);
  assert.deepEqual(state.profiles["reader-data"].likedPlaylists, []);
  assert.deepEqual(state.playlists[0].likedBy, [readerId]);
  assert.deepEqual(state.playlists[0].collaborators, []);
});

test("a deletion failure rolls back changes so the account can safely retry", async () => {
  state.deletionFailure = true;
  const result = await deleteRoute.POST(request("/api/deleteAccount", "POST", { confirm: "DELETE" }));
  assert.equal(result.status, 500);
  assert.equal(state.users.some((user) => user._id === ownerId), true);
  assert.equal(state.playlists[0]._id, playlistId);
  assert.deepEqual(state.profiles["reader-data"].likedPlaylists, [playlistId]);
  state.deletionFailure = false;
  assert.equal((await deleteRoute.POST(request("/api/deleteAccount", "POST", { confirm: "DELETE" }))).status, 200);
});

test("playlist likes apply desired state idempotently and roll back on profile failure", async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.equal((await likeRoute.POST(request("/api/userPlaylists/like", "POST", { playlistId, liked: true }))).status, 200);
  }
  assert.equal(state.playlists[0].likedBy.filter((id) => id === ownerId).length, 1);
  assert.deepEqual(state.profiles["owner-data"].likedPlaylists, [playlistId]);
  state.likeFailure = true;
  assert.equal((await likeRoute.POST(request("/api/userPlaylists/like", "POST", { playlistId, liked: false }))).status, 500);
  assert.ok(state.playlists[0].likedBy.includes(ownerId));
  state.likeFailure = false;
  assert.equal((await likeRoute.POST(request("/api/userPlaylists/like", "POST", { playlistId, liked: false }))).status, 200);
  assert.deepEqual(state.profiles["owner-data"].likedPlaylists, []);
  assert.equal(state.playlists[0].likedBy.includes(ownerId), false);
});

test("insights require opt-in and matching account, deduplicate events and exclude private sessions", async () => {
  const body = { id: "abcdefghijk", eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner: `account:${ownerId}`,
    event: "completed", startedAt: Date.now() - 60_000, listenedSeconds: 50 };
  assert.equal((await eventsRoute.POST(request("/api/playEvent", "POST", body))).status, 200);
  assert.equal(state.writes, 0);
  state.profiles["owner-data"].settings.listeningInsights = true;
  assert.equal((await eventsRoute.POST(request("/api/playEvent", "POST", { ...body, owner: `account:${readerId}` }))).status, 401);
  for (let attempt = 0; attempt < 2; attempt += 1) assert.equal((await eventsRoute.POST(request("/api/playEvent", "POST", body))).status, 200);
  assert.equal(state.profiles["owner-data"].listeningEvents.length, 1);
  const summary = await (await eventsRoute.GET(request("/api/playEvent?days=7"))).json();
  assert.equal(summary.data.sessions, 1);
  assert.equal(summary.data.seconds, 50);
  state.profiles["owner-data"].settings.privateSession = true;
  const writes = state.writes;
  assert.equal((await eventsRoute.POST(request("/api/playEvent", "POST", { ...body, eventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }))).status, 200);
  assert.equal(state.writes, writes);
  assert.equal((await eventsRoute.DELETE(request("/api/playEvent", "DELETE"))).status, 200);
  assert.deepEqual(state.profiles["owner-data"].listeningEvents, []);
});

test("saving a queue creates a private playlist and rolls back if its account reference cannot save", async () => {
  const payload = { name: "Queue snapshot", songs: ["abcdefghijk", "lmnopqrstuv", "abcdefghijk"] };
  state.likeFailure = true;
  assert.equal((await libraryRoute.POST(request("/api/userPlaylists", "POST", payload))).status, 500);
  assert.equal(state.playlists.length, 1);
  assert.deepEqual(state.profiles["owner-data"].playlists, [playlistId]);
  state.likeFailure = false;
  const response = await libraryRoute.POST(request("/api/userPlaylists", "POST", payload));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.data.playlist.visibility, "private");
  assert.deepEqual(data.data.playlist.songs, ["abcdefghijk", "lmnopqrstuv"]);
  assert.ok(state.profiles["owner-data"].playlists.includes(data.data.playlist._id));
  assert.equal((await libraryRoute.DELETE(request("/api/userPlaylists", "DELETE", { playlistId: data.data.playlist._id }))).status, 200);
  assert.deepEqual(state.profiles["owner-data"].playlists, [playlistId]);
});