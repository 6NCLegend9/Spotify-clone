import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { before, beforeEach, after, test } from "node:test";
import mongoose from "mongoose";
import ts from "typescript";
import JamRoom from "../src/models/JamRoom.js";
import * as jam from "../src/utils/jam.mjs";
import * as rooms from "../src/utils/jamRooms.mjs";
import { jamEventRole } from "../src/utils/jamAuthorization.mjs";
import { migrateJamRoomIndex } from "./migrate-jam-room-index.mjs";

const LEGACY = "hostId_1_nameKey_1";
const REPLACEMENT = "jam_named_room_host_name_unique";
const uri = process.env.HAYKASA_TEST_MONGO_URI;
assert.ok(uri, "Set HAYKASA_TEST_MONGO_URI explicitly to a disposable loopback MongoDB.");
const parsed = new URL(uri);
assert.equal(parsed.protocol, "mongodb:");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname), "Mongo index regressions are restricted to loopback.");
const databaseName = "haykasa_pr42_jam_index_" + randomUUID().replaceAll("-", "");
let connection, db, Room, currentUser;

function handler(file, model = Room, overrides = {}) {
  const source = new URL(file, import.meta.url);
  const api = {
    apiSuccess: (data, init) => Response.json({ data }, init),
    apiError: code => Response.json({ error: code }, { status: { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_ERROR: 400 }[code] || 500 }),
    handleApiError: () => Response.json({ error: "INTERNAL_ERROR" }, { status: 500 }),
    readRequestJson: request => request.json(),
  };
  const dependencies = {
    "@/models/JamRoom": { default: model },
    "@/utils/apiResponse": api,
    "@/utils/sessionAuth": { getSessionUser: async () => ({ _id: currentUser, userName: "QA" }) },
    "@/utils/trustedOrigin": { isTrustedRequestOrigin: () => true },
    "@/utils/rateLimit": { isRateLimited: async () => ({ limited: false }) },
    "@/utils/jam.mjs": jam,
    "@/utils/jamRooms.mjs": rooms,
    "@/utils/jamAuthorization.mjs": { jamEventRole },
    "@/utils/jamSigning": { jamPublicKey: () => "isolated-index-test", signJamEvent: value => value },
    ...overrides,
  };
  const realRequire = createRequire(source);
  const output = { exports: {} };
  // Actual route and Mongo model; only auth, signing and HTTP wrappers are controlled.
  const compiled = ts.transpileModule(readFileSync(source, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", compiled)(name => dependencies[name] || realRequire(name), output, output.exports);
  return output.exports.POST;
}

const request = (path, body) => new Request("http://localhost" + path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const list = () => db.collection("jamRooms").listIndexes().toArray();
const legacy = () => db.collection("jamRooms").createIndex({ hostId: 1, nameKey: 1 }, { name: LEGACY, unique: true, sparse: true });
const named = (hostId = "qa-host", nameKey = "late night", code = randomUUID()) => ({
  hostId, nameKey, name: "Late night", code, persistent: true,
  startedAt: Date.now(), expiresAt: new Date(Date.now() + 3600_000),
});

before(async () => {
  connection = await mongoose.createConnection(uri, {
    dbName: databaseName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10_000,
  }).asPromise();
  db = connection.db;
  Room = connection.model("JamRoomIndexRegression", JamRoom.schema, "jamRooms");
  await Room.init();
  console.log("MongoDB index regression server:", (await db.admin().command({ buildInfo: 1 })).version);
});
beforeEach(async () => {
  currentUser = "qa-host";
  await db.dropDatabase();
  await db.createCollection("jamRooms");
});
after(async () => {
  if (!connection) return;
  try {
    assert.match(db.databaseName, /^haykasa_pr42_jam_index_[a-f0-9]{32}$/);
    await db.dropDatabase();
  } finally { await connection.close(); }
});

test("real create/end/create fails with the legacy index and succeeds after explicit migration without waiting for TTL", async () => {
  await Room.createIndexes(); // A schema-only deployment leaves the old index in place.
  await legacy();
  const create = handler("../src/app/api/jam/route.js");
  const end = handler("../src/app/api/jam/events/route.js");
  const first = await create(request("/api/jam", { action: "create" }));
  assert.equal(first.status, 200);
  const grant = (await first.json()).data;
  assert.equal((await end(request("/api/jam/events", { roomId: grant.roomId, event: "ended", payload: {} }))).status, 200);
  assert.equal((await create(request("/api/jam", { action: "create" }))).status, 500);
  assert.equal(await Room.countDocuments(), 1);
  assert.equal((await Room.findById(grant.roomId)).closed, true);
  const beforeIndexes = await list();
  const plan = await migrateJamRoomIndex(db);
  assert.deepEqual(plan.drop, [LEGACY]);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(await list(), beforeIndexes, "Dry-run must not modify indexes.");
  assert.equal((await migrateJamRoomIndex(db, { apply: true })).verified, true);
  assert.equal((await create(request("/api/jam", { action: "create" }))).status, 200);
  assert.equal(await Room.countDocuments(), 2, "The ended room remains; TTL removal is not the fix.");
  const names = (await list()).map(index => index.name);
  assert.ok(names.includes("code_1") && names.includes("expiresAt_1") && names.includes(REPLACEMENT));
  assert.equal(names.includes(LEGACY), false);
});

test("named creation reuses its normalized host/name and Mongo rejects duplicate named rooms", async () => {
  await Room.createIndexes();
  const create = handler("../src/app/api/jam/route.js");
  const first = await create(request("/api/jam", { action: "create", name: "Late night" }));
  const repeated = await create(request("/api/jam", { action: "create", name: " late NIGHT " }));
  assert.equal(first.status, 200); assert.equal(repeated.status, 200);
  const firstGrant = (await first.json()).data;
  const repeatedGrant = (await repeated.json()).data;
  assert.equal(firstGrant.roomId, repeatedGrant.roomId);
  assert.equal(firstGrant.restored, false); assert.equal(repeatedGrant.restored, false);
  const savedTrack = { id: "abcdefghijk", queueEntryId: "saved:occurrence" };
  await Room.updateOne({ _id: firstGrant.roomId }, { $set: { closed: true, savedTrack, savedQueue: [savedTrack] } });
  const reopened = await create(request("/api/jam", { action: "create", name: "Late night" }));
  const reopenedGrant = (await reopened.json()).data;
  assert.equal(reopenedGrant.roomId, firstGrant.roomId); assert.equal(reopenedGrant.restored, true);
  assert.deepEqual(reopenedGrant.track, savedTrack); assert.deepEqual(reopenedGrant.queue, [savedTrack]);
  const live = await create(request("/api/jam", { action: "create", name: "Late night" }));
  assert.equal((await live.json()).data.restored, false);
  await assert.rejects(Room.create(named()), error => error.code === 11000);
  currentUser = "another-qa-host";
  assert.equal((await create(request("/api/jam", { action: "create", name: "Late night" }))).status, 200);
  await Room.create({ ...named(), persistent: false });
  await Room.create({ ...named(), persistent: false });
  assert.equal(await Room.countDocuments({ persistent: false }), 2);
});

test("two concurrent named creates load the same live winner instead of retrying name conflicts", async () => {
  await Room.createIndexes();
  let reads = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const model = {
    findOne: async filter => {
      const existing = await Room.findOne(filter);
      if (!existing && reads < 2) { reads += 1; if (reads === 2) release(); await barrier; }
      return existing;
    },
    create: (...args) => Room.create(...args),
  };
  const create = handler("../src/app/api/jam/route.js", model);
  const responses = await Promise.all([
    create(request("/api/jam", { action: "create", name: "Late night" })),
    create(request("/api/jam", { action: "create", name: " late NIGHT " })),
  ]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  const grants = await Promise.all(responses.map(async response => (await response.json()).data));
  assert.equal(grants[0].roomId, grants[1].roomId);
  assert.equal(grants[0].restored, false); assert.equal(grants[1].restored, false);
  assert.equal(await Room.countDocuments(), 1);
});

test("only code collisions retry creation; unexpected unique constraints are not swallowed", async () => {
  await Room.createIndexes();
  await Room.create(named("another-host", "reserved", "AAAAAA"));
  let randomCalls = 0;
  const create = handler("../src/app/api/jam/route.js", Room, {
    "node:crypto": { randomInt: () => randomCalls++ < 6 ? 0 : 1 },
  });
  const response = await create(request("/api/jam", { action: "create", name: "Late night" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.code, "BBBBBB");
  assert.equal(randomCalls, 12);
  await db.collection("jamRooms").createIndex({ hostId: 1 }, { unique: true });
  let attempts = 0;
  const unexpected = handler("../src/app/api/jam/route.js", {
    findOne: (...args) => Room.findOne(...args),
    create: (...args) => { attempts += 1; return Room.create(...args); },
  });
  assert.equal((await unexpected(request("/api/jam", { action: "create", name: "A different room" }))).status, 500);
  assert.equal(attempts, 1);
});

test("legacy-only migration verifies replacement before removal and is idempotent", async () => {
  await legacy();
  const collection = db.collection("jamRooms");
  const traced = {
    listIndexes: (...args) => collection.listIndexes(...args),
    aggregate: (...args) => collection.aggregate(...args),
    createIndex: (...args) => collection.createIndex(...args),
    dropIndex: async (...args) => {
      assert.ok((await list()).some(index => index.name === REPLACEMENT && index.unique === true));
      return collection.dropIndex(...args);
    },
  };
  assert.equal((await migrateJamRoomIndex({ collection: () => traced }, { apply: true })).verified, true);
  const second = await migrateJamRoomIndex(db, { apply: true });
  assert.deepEqual(second.create, []); assert.deepEqual(second.drop, []); assert.equal(second.verified, true);
});

test("a new installation creates only the replacement and an already-migrated database stays unchanged", async () => {
  const beforeIndexes = await list();
  const plan = await migrateJamRoomIndex(db);
  assert.deepEqual(plan.create, [REPLACEMENT]); assert.deepEqual(plan.drop, []);
  assert.deepEqual(await list(), beforeIndexes);
  await migrateJamRoomIndex(db, { apply: true });
  const indexesAfterApply = await list();
  await migrateJamRoomIndex(db, { apply: true });
  assert.deepEqual(await list(), indexesAfterApply);
});

test("unexpected legacy, replacement or competing definitions abort without index removal", async () => {
  const collection = db.collection("jamRooms");
  for (const definition of [
    { name: LEGACY, unique: true },
    { name: REPLACEMENT, unique: true, partialFilterExpression: { persistent: true } },
    { name: "unexpected_name_index", unique: true, sparse: true },
  ]) {
    await collection.createIndex({ hostId: 1, nameKey: 1 }, definition);
    const beforeIndexes = await list();
    await assert.rejects(migrateJamRoomIndex(db, { apply: true }), error => error.code === "JAM_INDEX_MIGRATION_BLOCKED");
    assert.deepEqual(await list(), beforeIndexes);
    await collection.dropIndex(definition.name);
  }
});

test("duplicate named data aborts before building or removing any index", async () => {
  await db.collection("jamRooms").insertMany([named(), named()]);
  const beforeIndexes = await list();
  await assert.rejects(migrateJamRoomIndex(db, { apply: true }), /Duplicate named Jam rooms/);
  assert.deepEqual(await list(), beforeIndexes); assert.equal(await Room.countDocuments(), 2);
});

test("a failed or unverified replacement never removes the legacy index", async () => {
  await legacy();
  const collection = db.collection("jamRooms");
  for (const createIndex of [async () => { throw new Error("Synthetic build failure"); }, async () => REPLACEMENT]) {
    const controlled = {
      listIndexes: (...args) => collection.listIndexes(...args),
      aggregate: (...args) => collection.aggregate(...args),
      createIndex,
      dropIndex: () => assert.fail("Legacy removal requires a verified replacement."),
    };
    await assert.rejects(migrateJamRoomIndex({ collection: () => controlled }, { apply: true }), error => error.code === "JAM_INDEX_MIGRATION_BLOCKED");
    assert.ok((await list()).some(index => index.name === LEGACY));
  }
});

test("CLI defaults to dry-run and never falls back to configured application MONGODB_URI", async () => {
  await legacy();
  const file = new URL("./migrate-jam-room-index.mjs", import.meta.url);
  const beforeIndexes = await list();
  const result = spawnSync(process.execPath, [fileURLToPath(file), "--database", databaseName], {
    encoding: "utf8", timeout: 30_000,
    env: { PATH: process.env.PATH, JAM_INDEX_MIGRATION_URI: uri },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).mode, "dry-run");
  assert.deepEqual(await list(), beforeIndexes);
  const applied = spawnSync(process.execPath, [fileURLToPath(file), "--database", databaseName, "--apply"], {
    encoding: "utf8", timeout: 30_000,
    env: { PATH: process.env.PATH, JAM_INDEX_MIGRATION_URI: uri },
  });
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).verified, true);
  assert.equal((await list()).some(index => index.name === LEGACY), false);
  assert.ok((await list()).some(index => index.name === REPLACEMENT));
  const rejected = spawnSync(process.execPath, [fileURLToPath(file), "--database", databaseName], {
    encoding: "utf8", timeout: 10_000,
    env: { PATH: process.env.PATH, MONGODB_URI: "mongodb://dummy-user:dummy-password@must-not-connect.invalid/" },
  });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Set JAM_INDEX_MIGRATION_URI explicitly/);
  assert.equal(rejected.stderr.includes("dummy-password"), false);
});
