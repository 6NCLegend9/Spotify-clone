import assert from "node:assert/strict";
import test, { beforeEach, after } from "node:test";
import { register } from "node:module";
import { webcrypto } from "node:crypto";
import { jamEventRole } from "../src/utils/jamAuthorization.mjs";
import { jamEnvelopeVerifier, signedJamChannel } from "../src/utils/jamSignedChannel.mjs";
const host = "aaaaaaaaaaaaaaaaaaaaaaaa";
const guest = "bbbbbbbbbbbbbbbbbbbbbbbb";
const stranger = "cccccccccccccccccccccccc";
const roomId = "dddddddddddddddddddddddd";
let user, room;
const originalSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "fixture-jam-signing-secret-for-tests-only";
globalThis.__apiFixtures = {
  token: () => user ? { id: user._id, sub: user._id, sessionVersion: 0 } : null,
  connect() {},
  User: { async findById() { return user; } },
  JamRoom: {
    async findById() { return room; },
    async updateOne(_filter, update) { if (update.$set) Object.assign(room, update.$set); if (update.$pull) room.members = room.members.filter((id) => id !== update.$pull.members); },
  },
};
register(new URL("./support/api-loader.mjs", import.meta.url));
const { jamPublicKey, signJamEvent } = await import("../src/utils/jamSigning.js");
const { POST } = await import("../src/app/api/jam/events/route.js");
const request = (event, payload = {}) => new Request("http://localhost:3000/api/jam/events", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ roomId, event, payload }) });
beforeEach(() => {
  user = { _id: host, isVerified: true, sessionVersion: 0, userName: "Real Host" };
  room = { _id: roomId, hostId: host, members: [host, guest], expiresAt: new Date(Date.now() + 30_000), startedAt: Date.now(), closed: false };
});
after(() => { if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; });
test("host commands are refused to guests, strangers, expired rooms and closed rooms", () => {
  for (const event of ["sync", "ended", "join-accept", "aux"]) {
    assert.equal(jamEventRole(room, host, event), "host");
    assert.equal(jamEventRole(room, guest, event), null);
    assert.equal(jamEventRole(room, stranger, event), null);
  }
  assert.equal(jamEventRole(room, guest, "enqueue"), "guest");
  assert.equal(jamEventRole(room, guest, "aux-control"), "guest");
  assert.equal(jamEventRole(room, guest, "arcade-score"), "guest");
  assert.equal(jamEventRole(room, host, "arcade-score"), "host");
  assert.equal(jamEventRole(room, stranger, "enqueue"), null);
  assert.equal(jamEventRole(room, stranger, "aux-control"), null);
  assert.equal(jamEventRole({ ...room, closed: true }, host, "sync"), null);
  assert.equal(jamEventRole({ ...room, expiresAt: new Date(0) }, host, "sync"), null);
});
test("server refuses forged host commands and anonymous event requests", async () => {
  user._id = guest;
  for (const event of ["sync", "ended", "join-accept"]) assert.equal((await POST(request(event, { role: "host", participantId: host }))).status, 403);
  user._id = stranger;
  assert.equal((await POST(request("enqueue", { track: { id: "song" } }))).status, 403);
  user = null;
  assert.equal((await POST(request("sync"))).status, 401);
});
test("server signs the authenticated identity and only a host can end a Jam", async () => {
  const response = await POST(request("heartbeat", { participantId: stranger, role: "guest", name: "Spoofed" }));
  assert.equal(response.status, 200);
  const verify = await jamEnvelopeVerifier(jamPublicKey(), roomId, webcrypto.subtle);
  const message = await verify((await response.json()).data, "heartbeat");
  assert.equal(message.senderId, host);
  assert.equal(message.payload.participantId, host);
  assert.equal(message.payload.name, "Real Host");
  assert.equal(message.role, "host");
  assert.equal((await POST(request("ended"))).status, 200);
  assert.equal(room.closed, true);
});

test("persistent rooms keep the saved queue when the host closes them", async () => {
  room.persistent = true;
  const response = await POST(request("ended", {
    queue: [{ id: "abcdefghijk", title: "Song", thumbnail: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg" }],
    track: { id: "abcdefghijk", title: "Song" },
  }));
  assert.equal(response.status, 200);
  assert.equal(room.closed, true);
  assert.equal(room.savedTrack.id, "abcdefghijk");
  assert.equal(room.savedQueue.length, 1);
});
test("browser verification rejects unsigned, altered, replayed, wrong-room and wrong-event messages", async () => {
  const envelope = signJamEvent({ roomId, event: "sync", senderId: host, role: "host", payload: { isPlaying: true } });
  const verify = await jamEnvelopeVerifier(jamPublicKey(), roomId, webcrypto.subtle);
  assert.equal(await verify({ payload: { isPlaying: false } }, "sync"), null);
  assert.equal(await verify({ ...envelope, message: envelope.message.replace('"isPlaying":true', '"isPlaying":false') }, "sync"), null);
  assert.equal(await verify(envelope, "ended"), null);
  const otherRoom = await jamEnvelopeVerifier(jamPublicKey(), "other-room", webcrypto.subtle);
  assert.equal(await otherRoom(envelope, "sync"), null);
  const deliveries = await Promise.all([verify(envelope, "sync"), verify(envelope, "sync")]);
  assert.equal(deliveries.filter(Boolean).length, 1);
  assert.equal(await verify(envelope, "sync"), null);
});
test("unsigned realtime presence and broadcasts do not reach the player", async () => {
  const callbacks = new Map();
  const raw = { on(type, filter, handler) { callbacks.set(`${type}:${filter.event}`, handler); } };
  const channel = await signedJamChannel(raw, { publicKey: jamPublicKey(), roomId });
  let applied = 0;
  channel.on("broadcast", { event: "sync" }, () => { applied++; });
  channel.on("presence", { event: "sync" }, () => { applied++; });
  assert.equal(callbacks.has("presence:sync"), false);
  await callbacks.get("broadcast:sync")({ payload: { track: { id: "injected" } } });
  assert.equal(applied, 0);
  const envelope = signJamEvent({ roomId, event: "sync", senderId: host, role: "host", payload: { track: { id: "real" } } });
  await callbacks.get("broadcast:sync")({ payload: envelope });
  assert.equal(applied, 1);
});
