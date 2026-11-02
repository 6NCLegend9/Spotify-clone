import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as core from "../src/utils/apiResponseCore.mjs";
import * as diagnostics from "../src/utils/diagnostics.mjs";
import { mongoPoolSize } from "../src/utils/mongoPoolSize.mjs";

const require = createRequire(import.meta.url);
const next = require("next/server");
const esm = value => ({ __esModule: true, default: value });
function load(file, dependencies, env = {}, globals = {}) {
  const input = file === "../src/utils/dbconnect.js" && process.env.HAYKASA_DATABASE_BASELINE
    ? process.env.HAYKASA_DATABASE_BASELINE : new URL(file, import.meta.url);
  const source = ts.transpileModule(readFileSync(input, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "process", "globalThis", source)(name => {
    assert(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  }, loaded, loaded.exports, { env }, globals);
  return loaded.exports;
}

const api = load("../src/utils/apiResponse.js", {
  "next/server": next, "node:crypto": crypto,
  "./diagnostics.mjs": diagnostics, "./apiResponseCore.mjs": core,
});
function database({ env = {}, connect, resolve = async url => url } = {}) {
  const calls = [], globals = {};
  const mongoose = { set() {}, connect: async (...args) => { calls.push(args); return connect ? connect(...args) : { localFixture: true }; } };
  const db = load("../src/utils/dbconnect.js", {
    mongoose: esm(mongoose), "./mongoSrvUrl.mjs": { resolveMongoConnectionUrl: resolve },
    "./mongoPoolSize.mjs": { mongoPoolSize }, "./apiResponseCore.mjs": core,
  }, env, globals).default;
  return { db, calls, globals };
}

function handlers(db, { queryFailure = false } = {}) {
  const rateLimit = load("../src/utils/rateLimit.js", {
    crypto: esm(crypto), "@/utils/dbconnect": esm(db),
    "@/models/RateLimit": esm({ findOneAndUpdate() {
      if (queryFailure) throw new Error("LOCAL_PRIVATE_QUERY_DETAIL");
      return { select: () => ({ lean: async () => ({ count: 1 }) }) };
    } }),
  }, { NODE_ENV: "production", RATE_LIMIT_SECRET: "local-qa-only" });
  const source = readFileSync(new URL("../src/app/api/recommendations/route.js", import.meta.url), "utf8");
  const dependencies = {};
  // Unreached catalog dependencies are not network mocks. The real limiter must
  // reject before account/catalog work when its durable database is unavailable.
  for (const [, name] of source.matchAll(/from ["']([^"']+)["']/g)) dependencies[name] = {};
  Object.assign(dependencies, {
    "next/server": next, "node:crypto": crypto, "@/utils/apiResponse": api,
    "@/utils/rateLimit": rateLimit,
    "@/utils/userAccount": { getAuthenticatedAccount: () => { throw new Error("must not pass the unavailable durable limiter"); } },
  });
  const recommendations = load("../src/app/api/recommendations/route.js", dependencies);
  const week = load("../src/app/api/week-on-kasa/route.js", {
    "next/server": next, "@/utils/dbconnect": esm(db), "@/models/WeekPulse": {},
    "@/utils/rateLimit": rateLimit, "@/utils/apiResponse": api, "@/utils/weekPulse.mjs": {},
  });
  return [recommendations.GET, week.GET];
}
const request = () => new next.NextRequest("http://127.0.0.1/api/local-database-regression");

for (const env of [{}, { MONGODB_URL: "  ", MONGODB_URI: "\t" }]) {
  test(`actual homepage handlers fail closed with503 when database configuration is ${Object.keys(env).length ? "blank" : "missing"}`, async () => {
    const fixture = database({ env });
    for (const handler of handlers(fixture.db)) {
      const response = await handler(request());
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("retry-after"), "30");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal((await response.json()).code, "SERVICE_UNAVAILABLE");
    }
    assert.equal(fixture.calls.length, 0);
  });
}

test("configured connection failure is sanitized, shared by concurrent requests, and recoverable", async () => {
  let reject, failing = true;
  const fixture = database({ env: { MONGODB_URI: "mongodb://local-qa.invalid/unused" }, connect: () => failing
    ? new Promise((_, rejectRequest) => { reject = rejectRequest; }) : { localFixture: true } });
  const pending = [fixture.db(), fixture.db()];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.calls.length, 1);
  reject(new Error("LOCAL_PRIVATE_CONNECTION_DETAIL"));
  for (const result of await Promise.allSettled(pending)) {
    assert.equal(result.status, "rejected");
    assert.equal(result.reason.status, 503);
    assert(!JSON.stringify(result.reason).includes("LOCAL_PRIVATE"));
  }
  failing = false;
  const recovered = await fixture.db();
  assert.strictEqual(await fixture.db(), recovered);
  assert.equal(fixture.calls.length, 2);
});

test("a blank preferred alias falls through to the configured URI without changing pool options", async () => {
  const fixture = database({ env: { MONGODB_URL: " ", MONGODB_URI: "mongodb://local-qa.invalid/unused", DB_NAME: "local_qa" } });
  await fixture.db();
  assert.equal(fixture.calls[0][0], "mongodb://local-qa.invalid/unused");
  assert.equal(fixture.calls[0][1].dbName, "local_qa");
  assert.equal(fixture.calls[0][1].serverSelectionTimeoutMS, 10_000);
});

test("DNS/URI preparation failures are unavailable without exposing connection details", async () => {
  const fixture = database({ env: { MONGODB_URI: "mongodb+srv://local-qa.invalid/unused" }, resolve: async () => { throw new Error("LOCAL_PRIVATE_DNS_DETAIL"); } });
  await assert.rejects(fixture.db(), error => error instanceof core.ApiRouteError && error.status === 503 && !error.message.includes("LOCAL_PRIVATE"));
  assert.equal(fixture.calls.length, 0);
});

test("query/programming errors remain500 instead of being mislabeled as a connection outage", async () => {
  const fixture = database({ env: { MONGODB_URI: "mongodb://local-qa.invalid/unused" } });
  for (const handler of handlers(fixture.db, { queryFailure: true })) {
    const response = await handler(request());
    assert.equal(response.status, 500);
    assert(!JSON.stringify(await response.json()).includes("LOCAL_PRIVATE"));
  }
});
