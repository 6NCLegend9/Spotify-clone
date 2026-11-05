import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as core from "../src/utils/apiResponseCore.mjs";
import * as diagnostics from "../src/utils/diagnostics.mjs";
import * as mutation from "../src/utils/documentMutation.mjs";
import * as notifications from "../src/utils/accountNotifications.mjs";

const require = createRequire(import.meta.url);
const next = require("next/server");
function load(relative, dependencies) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected test import: ${name}`);
    return dependencies[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const responses = load("../src/utils/apiResponse.js", {
  "next/server": next, "node:crypto": require("node:crypto"),
  "./apiResponseCore.mjs": core, "./diagnostics.mjs": diagnostics,
});

function fixture(initial = [], options = {}) {
  let current = { _id: options.id || "account-data", __v: 0, seenNotificationIds: [...initial] };
  const authenticatedSnapshot = structuredClone(current);
  const stats = { reads: 0, writes: 0, conflicts: 0 };
  let releaseReads;
  const simultaneousReads = new Promise(resolve => { releaseReads = resolve; });
  const model = {
    findById(id) {
      assert.equal(id, "account-data");
      return { lean: async () => {
        const snapshot = structuredClone(current);
        stats.reads += 1;
        if (options.concurrent && stats.reads <= 2) {
          if (stats.reads === 2) releaseReads();
          await simultaneousReads;
        }
        return snapshot;
      } };
    },
    findOneAndUpdate(filter, update) {
      return { lean: async () => {
        assert.equal(filter._id, "account-data");
        const matches = filter.$and.every(condition => Object.entries(condition).every(([key, expected]) => (
          Object.hasOwn(expected, "$exists") ? Object.hasOwn(current, key) === expected.$exists
            : JSON.stringify(current[key]) === JSON.stringify(expected.$eq)
        )));
        if (options.conflict || !matches) { stats.conflicts += 1; return null; }
        stats.writes += 1;
        current = { ...current, ...structuredClone(update.$set), __v: current.__v + update.$inc.__v };
        return structuredClone(current);
      } };
    },
    async updateOne(filter, update) {
      // Retain the original unsafe write so this actual-handler regression fails before the fix.
      assert.equal(filter._id, "account-data");
      stats.writes += 1;
      current = { ...current, ...structuredClone(update.$set) };
      return { modifiedCount: 1 };
    },
  };
  const handler = load("../src/app/api/notifications/read/route.js", {
    "next/server": next,
    "@/models/UserData": { __esModule: true, default: options.model || model },
    "@/utils/apiResponse": responses,
    "@/utils/documentMutation.mjs": mutation,
    "@/utils/accountNotifications.mjs": notifications,
    "@/utils/trustedOrigin": { isTrustedRequestOrigin: () => options.origin !== false },
    "@/utils/rateLimit": { isRateLimited: async () => ({ limited: Boolean(options.limited) }) },
    "@/utils/userAccount": { getAuthenticatedAccount: async () => {
      if (options.authenticated === false) throw new core.ApiRouteError("UNAUTHORIZED");
      // Both requests deliberately authenticate with the same stale snapshot.
      return { userData: structuredClone(authenticatedSnapshot), email: "qa@example.invalid" };
    } },
  });
  return {
    stats, saved: () => structuredClone(current.seenNotificationIds),
    post: ids => handler.POST(new Request("https://haykasa.test/api/notifications/read", {
      method: "POST", headers: { origin: "https://haykasa.test", "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    })),
  };
}

test("parallel real-handler requests preserve both acknowledgements after a forced snapshot conflict", async () => {
  const app = fixture([], { concurrent: true });
  const results = await Promise.all([app.post(["release:first"]), app.post(["release:second"])]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.deepEqual(new Set(app.saved()), new Set(["release:first", "release:second"]));
  const bodies = await Promise.all(results.map(result => result.json()));
  assert.ok(bodies[0].seenNotificationIds.includes("release:first"));
  assert.ok(bodies[1].seenNotificationIds.includes("release:second"));
  assert.equal(app.stats.conflicts, 1);
});

test("concurrent updates deduplicate and retain both new IDs at the 200-ID boundary", async () => {
  const original = Array.from({ length: 199 }, (_, index) => `previous:${index}`);
  const app = fixture(original, { concurrent: true });
  const results = await Promise.all([
    app.post(["release:first", "release:first"]), app.post(["release:second", "release:second"]),
  ]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  const saved = app.saved();
  assert.equal(saved.length, 200);
  assert.equal(new Set(saved).size, 200);
  assert.ok(saved.includes("release:first") && saved.includes("release:second"));
  assert.equal(saved.includes("previous:0"), false);
});

test("sanitization, incoming limit and retention of the latest 200 IDs are unchanged", async () => {
  const app = fixture(Array.from({ length: 200 }, (_, index) => `previous:${index}`));
  const result = await app.post([null, {}, "invalid id", ...Array.from({ length: 60 }, (_, index) => `new:${index}`)]);
  assert.equal(result.status, 200);
  const saved = app.saved();
  assert.equal(saved.length, 200);
  assert.equal(saved[0], "previous:50");
  assert.equal(saved.at(-1), "new:49");
  assert.equal(saved.filter(id => id.startsWith("new:")).length, 50);
});

test("exhausted write conflicts return 409 without falsely acknowledging a read", async () => {
  const app = fixture(["previous:read"], { conflict: true });
  const result = await app.post(["release:new"]);
  assert.equal(result.status, 409);
  assert.equal((await result.json()).success, false);
  assert.deepEqual(app.saved(), ["previous:read"]);
  assert.equal(app.stats.conflicts, 5);
});

test("origin, authentication and rate-limit rejection occur before persistence", async () => {
  for (const [options, expected] of [[{ origin: false }, 403], [{ authenticated: false }, 401], [{ limited: true }, 429]]) {
    const app = fixture([], options);
    assert.equal((await app.post(["release:new"])).status, expected);
    assert.equal(app.stats.reads + app.stats.writes, 0);
    assert.deepEqual(app.saved(), []);
  }
});

const mongoUri = process.env.HAYKASA_TEST_MONGO_URI;
if (mongoUri) {
  const target = new URL(mongoUri);
  assert.ok(target.protocol === "mongodb:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
    && !target.username && !target.password && ["", "/"].includes(target.pathname), "Mongo QA requires an explicit credential-free loopback URI without a database name");
  test("real MongoDB preserves parallel acknowledgements and the 200-ID cap using the actual UserData schema", async () => {
    const mongoose = require("mongoose");
    const { default: UserData } = await import("../src/models/UserData.js");
    const dbName = `haykasa_pr42_notifications_${randomUUID().replaceAll("-", "")}`;
    const connection = await mongoose.createConnection(mongoUri, { dbName, directConnection: true, serverSelectionTimeoutMS: 5000 }).asPromise();
    try {
      assert.equal(connection.db.databaseName, dbName);
      const Account = connection.model("userData", UserData.schema, UserData.collection.name);
      for (const previousCount of [0, 199]) {
        const initial = Array.from({ length: previousCount }, (_, index) => `previous:${index}`);
        const account = await Account.create({ seenNotificationIds: initial });
        let reads = 0, writes = 0, release;
        const together = new Promise(resolve => { release = resolve; });
        const model = {
          findById: id => ({ lean: async () => {
            const snapshot = await Account.findById(id).lean();
            reads += 1;
            if (reads <= 2) { if (reads === 2) release(); await together; }
            return snapshot;
          } }),
          findOneAndUpdate: (...args) => { writes += 1; return Account.findOneAndUpdate(...args); },
          updateOne: (...args) => Account.updateOne(...args),
        };
        const app = fixture(initial, { id: String(account._id), model });
        const results = await Promise.all([
          app.post(["release:first", "release:first"]), app.post(["release:second", "release:second"]),
        ]);
        assert.deepEqual(results.map(result => result.status), [200, 200]);
        const persisted = await Account.findById(account._id).lean();
        assert.ok(persisted.seenNotificationIds.includes("release:first") && persisted.seenNotificationIds.includes("release:second"));
        assert.equal(persisted.seenNotificationIds.length, Math.min(200, previousCount + 2));
        assert.equal(new Set(persisted.seenNotificationIds).size, persisted.seenNotificationIds.length);
        assert.equal(persisted.__v, 2);
        assert.equal(reads, 3);
        assert.equal(writes, 3);
      }
    } finally {
      try { await connection.dropDatabase(); } finally { await connection.close(); }
    }
  });
}
