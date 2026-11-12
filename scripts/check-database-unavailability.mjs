import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import * as core from "../src/utils/apiResponseCore.mjs";
import * as diagnostics from "../src/utils/diagnostics.mjs";
import { mongoPoolSize } from "../src/utils/mongoPoolSize.mjs";
import * as identities from "../src/utils/sessionIdentity.mjs";
import * as desktopAuth from "../src/utils/desktopAuth.mjs";

const require = createRequire(import.meta.url);
const next = require("next/server");
const esm = value => ({ __esModule: true, default: value });
function load(file, dependencies, env = {}, globals = {}) {
  let input = file === "../src/utils/dbconnect.js" && process.env.HAYKASA_DATABASE_BASELINE
    ? process.env.HAYKASA_DATABASE_BASELINE : new URL(file, import.meta.url);
  const authBaseline = { "../src/utils/sessionAuth.js": "sessionAuth.js",
    "../src/app/api/desktop/auth/authorize/route.js": "authorize.js", "../src/app/api/desktop/auth/exchange/route.js": "exchange.js" }[file];
  if (authBaseline && process.env.HAYKASA_AUTH_OUTAGE_BASELINE) input = path.join(process.env.HAYKASA_AUTH_OUTAGE_BASELINE, authBaseline);
  const source = ts.transpileModule(readFileSync(input, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
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

test("authenticated session lookup preserves503 and Retry-After through its outage wrapper", async () => {
  const fixture = database();
  const session = load("../src/utils/sessionAuth.js", {
    "next-auth/jwt": { getToken: async () => ({ id: "000000000000000000000042", sub: "000000000000000000000042", sessionVersion: 0 }) },
    "@/models/User": esm({ findById: () => { throw new Error("must not query an unavailable database"); } }),
    "@/utils/dbconnect": esm(fixture.db), "@/utils/authToken": { tokenOptions: () => ({}) },
    "@/utils/sessionIdentity.mjs": identities, "@/utils/diagnostics.mjs": diagnostics,
    "@/utils/apiResponseCore.mjs": core,
  });
  const invalid = await session.resolveSessionUser(null);
  assert.equal(invalid, null, "invalid identities still fail authentication normally");
  const error = await session.getSessionUser(request()).catch(value => value);
  assert(error instanceof session.SessionLookupUnavailableError);
  assert.equal(error.cause.code, "SERVICE_UNAVAILABLE");
  assert(!JSON.stringify(error).includes("cause"), "private causes remain non-enumerable");
  const response = api.handleApiError(error);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "30");
});

for (const [kind, phase] of [["authorize", "session"], ["authorize", "limiter"], ["exchange", "limiter"], ["exchange", "database"]]) test(`desktop ${kind} returns a safe503 on unavailable ${phase}`, async () => {
  const outage = new core.ApiRouteError("SERVICE_UNAVAILABLE", { headers: { "Retry-After": "30" } });
  const deps = {
    "node:crypto": crypto, "@/models/DesktopAuthGrant": {}, "@/models/User": {},
    "@/utils/apiResponse": api, "@/utils/apiResponseCore.mjs": core,
    "@/utils/rateLimit": { isRateLimited: async () => { if (phase === "limiter") throw outage; return { limited: false }; } },
    "@/utils/userAccount": { getAuthenticatedAccount: async () => { if (phase === "session") throw outage; return { user: { _id: "000000000000000000000042" }, email: "qa@example.invalid" }; } },
    "@/utils/desktopAuth.mjs": desktopAuth, "@/utils/dbconnect": esm(async () => { throw outage; }),
    "@/utils/authToken": {}, "@/utils/sessionIdentity.mjs": identities, "next-auth/jwt": {},
  };
  const routes = load(`../src/app/api/desktop/auth/${kind}/route.js`, deps);
  const state = "state_".padEnd(48, "x"), verifier = "v".repeat(64);
  const call = kind === "authorize"
    ? new next.NextRequest(`http://127.0.0.1/api/desktop/auth/authorize?state=${state}&challenge=${desktopAuth.desktopPkceChallenge(verifier)}`)
    : new next.NextRequest("http://127.0.0.1/api/desktop/auth/exchange", { method: "POST", body: JSON.stringify({ code: "c".repeat(43), state, verifier }) });
  const response = await routes[kind === "authorize" ? "GET" : "POST"](call);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "30");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const payload = await response.json();
  assert.equal(payload.code, "SERVICE_UNAVAILABLE");
  assert.equal(typeof payload.error, "string", "old desktop clients can still read the error string");
  assert.equal(payload.sessionToken, undefined);
});
