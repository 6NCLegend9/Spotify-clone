import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import ts from "typescript";
import DesktopAuthGrant from "../src/models/DesktopAuthGrant.js";
import User from "../src/models/User.js";
import * as core from "../src/utils/apiResponseCore.mjs";
import * as diagnostics from "../src/utils/diagnostics.mjs";
import * as desktopAuth from "../src/utils/desktopAuth.mjs";
import * as identities from "../src/utils/sessionIdentity.mjs";
import * as authErrors from "../src/utils/authErrors.js";
import * as tokenHash from "../src/utils/tokenHash.mjs";

// Explicit isolated endpoint only: never fall back to the application's database configuration.
const uri = process.env.HAYKASA_TEST_MONGO_URI;
assert.ok(uri, "Set HAYKASA_TEST_MONGO_URI to a disposable loopback MongoDB");
const endpoint = new URL(uri);
assert.equal(endpoint.protocol, "mongodb:");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname));
assert.equal(endpoint.username + endpoint.password, "");
const database = `haykasa_pr42_desktop_auth_${crypto.randomBytes(8).toString("hex")}`;
const require = createRequire(import.meta.url);
const { encode, decode } = require("next-auth/jwt");
const secret = "isolated-desktop-grant-regression-secret-000000000000";
const esmDefault = value => ({ __esModule: true, default: value });

function load(relative, dependencies) {
  const compiled = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
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
  "next/server": require("next/server"), "node:crypto": crypto,
  "./apiResponseCore.mjs": core, "./diagnostics.mjs": diagnostics,
});
const limit = { getClientKey: () => "local-grant-qa", isRateLimited: async () => ({ limited: false }) };
let account, beforeLookup, beforeEncode;
const authorize = load("../src/app/api/desktop/auth/authorize/route.js", {
  "@/utils/apiResponse": responses,
  "node:crypto": crypto,
  "@/models/DesktopAuthGrant": esmDefault(DesktopAuthGrant),
  "@/utils/rateLimit": limit,
  "@/utils/userAccount": { getAuthenticatedAccount: async () => account ? { user: account, email: account.email } : null },
  "@/utils/desktopAuth.mjs": desktopAuth,
});
const exchange = load("../src/app/api/desktop/auth/exchange/route.js", {
  "@/utils/apiResponse": responses,
  "@/utils/apiResponseCore.mjs": core,
  "next-auth/jwt": { encode: async options => {
    if (beforeEncode) await beforeEncode();
    return encode(options);
  } },
  "@/models/DesktopAuthGrant": esmDefault(DesktopAuthGrant),
  "@/models/User": esmDefault({ findById: async id => {
    if (beforeLookup) await beforeLookup();
    return User.findById(id);
  } }),
  "@/utils/authToken": { authSecret: () => secret },
  "@/utils/dbconnect": esmDefault(async () => {}),
  "@/utils/desktopAuth.mjs": desktopAuth,
  "@/utils/rateLimit": limit,
  "@/utils/sessionIdentity.mjs": identities,
});
const revoke = load("../src/app/api/account/sessions/route.js", {
  "@/models/User": esmDefault(User),
  "@/utils/sessionAuth": { getSessionUser: async () => User.findById(account._id) },
  "@/utils/rateLimit": limit, "@/utils/apiResponse": responses,
  "@/utils/trustedOrigin": { isTrustedRequestOrigin: () => true },
});
const reset = load("../src/app/api/forgotPassword/route.js", {
  crypto, bcryptjs: require("bcryptjs"),
  "@/models/User": esmDefault(User),
  "@/utils/mailSender": esmDefault(async () => { throw new Error("Mail is not permitted in this test"); }),
  "@/utils/dbconnect": esmDefault(async () => {}),
  "@/emails/ResetPasswordEmail": { getResetPasswordTemplate: () => "" },
  "@/utils/appUrl": { getAppLink: () => "", getPublicAssetUrl: () => "" },
  "@/utils/rateLimit": limit, "@/utils/apiResponse": responses,
  "@/utils/authErrors": authErrors, "@/utils/tokenHash.mjs": tokenHash,
});
const request = (path, body, method = "POST") => new Request(`https://haykasa.test${path}`, {
  method, headers: { "content-type": "application/json", origin: "https://haykasa.test" },
  body: JSON.stringify(body),
});

before(async () => {
  await mongoose.connect(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
  await Promise.all([DesktopAuthGrant.init(), User.init()]);
});
beforeEach(async () => {
  await Promise.all([DesktopAuthGrant.deleteMany({}), User.deleteMany({})]);
  beforeLookup = null; beforeEncode = null;
  account = await User.create({ userName: "Local QA", email: "qa@example.invalid", isVerified: true, sessionVersion: 0 });
});
after(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === database) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function issue() {
  const state = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const url = new URL("https://haykasa.test/api/desktop/auth/authorize");
  url.searchParams.set("state", state);
  url.searchParams.set("challenge", desktopAuth.desktopPkceChallenge(verifier));
  const response = await authorize.GET(new Request(url));
  assert.equal(response.status, 303);
  const code = new URL(response.headers.get("Location")).searchParams.get("code");
  return { code, state, verifier };
}
const consume = value => exchange.POST(request("/api/desktop/auth/exchange", value));
async function revokeAll() {
  assert.equal((await revoke.POST(request("/api/account/sessions", { confirm: true }))).status, 200);
}
async function claims(response) {
  const body = await response.json();
  assert.equal(body.cookieName, "__Secure-next-auth.session-token");
  const value = await decode({ token: body.sessionToken, secret });
  assert.ok(identities.hasSessionIdentity(value));
  return value;
}

test("fresh grant stores its issuer version, mints that version and remains single use", async () => {
  const value = await issue();
  const grant = await DesktopAuthGrant.findOne({ codeHash: desktopAuth.hashDesktopAuthValue(value.code) }).lean();
  assert.equal(grant.sessionVersion, 0);
  const response = await consume(value);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const token = await claims(response);
  assert.equal(token.sessionVersion, grant.sessionVersion);
  assert.equal(identities.isCurrentSession(token, await User.findById(account._id)), true);
  assert.equal((await consume(value)).status, 401);
});

test("actual sign-out-all operation revokes an unconsumed desktop grant", async () => {
  const value = await issue(); await revokeAll();
  assert.equal((await User.findById(account._id)).sessionVersion, 1);
  const response = await consume(value);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).sessionToken, undefined);
});

test("actual password-reset operation revokes an earlier desktop grant", async () => {
  const resetToken = crypto.randomBytes(32).toString("hex");
  await User.updateOne({ _id: account._id }, { $set: {
    resetPasswordToken: tokenHash.hashToken(resetToken), resetPasswordExpires: new Date(Date.now() + 60_000),
  } });
  const value = await issue();
  const password = "Local-QA-Password-42!";
  const result = await reset.PUT(request("/api/forgotPassword", { token: resetToken, password, confirmPassword: password }, "PUT"));
  assert.equal(result.status, 200);
  assert.equal((await User.findById(account._id)).sessionVersion, 1);
  assert.equal((await consume(value)).status, 401);
});

test("revocation after grant consumption but before account lookup cannot upgrade an old authorization", async () => {
  const value = await issue(); beforeLookup = revokeAll;
  assert.equal((await consume(value)).status, 401);
});

test("revocation after validation never mints the newer session version", async () => {
  const value = await issue(); beforeEncode = revokeAll;
  const response = await consume(value);
  assert.equal(response.status, 200);
  const token = await claims(response);
  assert.equal(token.sessionVersion, 0);
  const current = await User.findById(account._id);
  assert.equal(current.sessionVersion, 1);
  assert.equal(identities.isCurrentSession(token, current), false);
});

test("parallel exchanges atomically consume a grant once", async () => {
  const value = await issue(); const responses = await Promise.all([consume(value), consume(value)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 401]);
  const token = await claims(responses.find(response => response.status === 200));
  assert.equal(identities.isCurrentSession(token, await User.findById(account._id)), true);
});

test("state, PKCE and expiration validation still guard consumption", async () => {
  const value = await issue();
  assert.equal((await consume({ ...value, state: crypto.randomBytes(32).toString("base64url") })).status, 401);
  assert.equal((await consume({ ...value, verifier: crypto.randomBytes(32).toString("base64url") })).status, 401);
  assert.equal((await DesktopAuthGrant.findOne({ codeHash: desktopAuth.hashDesktopAuthValue(value.code) }).lean()).consumedAt, null);
  assert.equal((await consume(value)).status, 200);
  const expired = await issue();
  await DesktopAuthGrant.updateOne({ codeHash: desktopAuth.hashDesktopAuthValue(expired.code) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await consume(expired)).status, 401);
});

test("legacy grants with no bound session version fail closed", async () => {
  const value = await issue();
  await DesktopAuthGrant.collection.updateOne({ codeHash: desktopAuth.hashDesktopAuthValue(value.code) }, { $unset: { sessionVersion: "" } });
  assert.equal((await consume(value)).status, 401);
});

test("a new authenticated session can issue and exchange a nonzero-version grant", async () => {
  await revokeAll(); account = await User.findById(account._id);
  const value = await issue(); const response = await consume(value);
  assert.equal(response.status, 200);
  const token = await claims(response);
  assert.equal(token.sessionVersion, 1);
  assert.equal(identities.isCurrentSession(token, account), true);
});

test("revocation during grant persistence does not rebase the issuing session", async t => {
  const original = DesktopAuthGrant.create;
  DesktopAuthGrant.create = async function (...args) { await revokeAll(); return original.apply(this, args); };
  t.after(() => { DesktopAuthGrant.create = original; });
  const value = await issue();
  const grant = await DesktopAuthGrant.findOne({ codeHash: desktopAuth.hashDesktopAuthValue(value.code) }).lean();
  assert.equal(grant.sessionVersion, 0);
  assert.equal((await consume(value)).status, 401);
});

test("malformed legacy version fields are rejected without coercion", async () => {
  for (const sessionVersion of [null, -1, 0.5, "0", Number.MAX_SAFE_INTEGER + 1]) {
    const value = await issue();
    await DesktopAuthGrant.collection.updateOne({ codeHash: desktopAuth.hashDesktopAuthValue(value.code) }, { $set: { sessionVersion } });
    assert.equal((await consume(value)).status, 401);
  }
});

test("non-string credentials return 400 and cannot consume a valid grant", async () => {
  const value = await issue();
  for (const key of ["code", "state", "verifier"]) {
    for (const malformed of [{ toString: 0 }, [value[key]], {}, null, 42]) {
      assert.equal((await consume({ ...value, [key]: malformed })).status, 400);
    }
  }
  const grant = await DesktopAuthGrant.findOne({ codeHash: desktopAuth.hashDesktopAuthValue(value.code) }).lean();
  assert.equal(grant.consumedAt, null);
  assert.equal((await consume(value)).status, 200);
});
