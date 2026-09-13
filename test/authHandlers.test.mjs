import assert from "node:assert/strict";
import { register } from "node:module";
import test, { after, beforeEach } from "node:test";
import { hashToken } from "../src/utils/tokenHash.mjs";

const canonicalOrigin = "https://haykasa.vercel.app";
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};
let state;

function query(value) {
  return {
    select() {
      return this;
    },
    lean() {
      return Promise.resolve(value);
    },
    then(fulfilled, rejected) {
      return Promise.resolve(value).then(fulfilled, rejected);
    },
  };
}

function matches(document, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected && typeof expected === "object" && "$gt" in expected) {
      return actual > expected.$gt;
    }
    return String(actual) === String(expected);
  });
}

function attachSave(user) {
  user.save = async () => {
    state.writes += 1;
    return user;
  };
  return user;
}

globalThis.__apiFixtures = {
  token: () => null,
  connect() {
    state.connections += 1;
  },
  rateLimit() {
    return { limited: false };
  },
  mail(...args) {
    state.mails.push(args);
    if (state.mailFailure) throw new Error("Fixture SMTP unavailable");
  },
  User: {
    findOne(filter) {
      return query(state.users.find((user) => matches(user, filter)) || null);
    },
    findOneAndUpdate(filter, update) {
      const user = state.users.find((entry) => matches(entry, filter));
      if (!user) return query(null);
      Object.assign(user, update.$set);
      if (update.$inc?.sessionVersion) {
        user.sessionVersion = (user.sessionVersion || 0) + update.$inc.sessionVersion;
      }
      state.writes += 1;
      return query(user);
    },
    async create(document) {
      const user = attachSave({
        ...document,
        _id: "cccccccccccccccccccccccc",
        isVerified: false,
        sessionVersion: 0,
      });
      state.users.push(user);
      state.writes += 1;
      return user;
    },
    async updateOne(filter, update) {
      const user = state.users.find((entry) => matches(entry, filter));
      if (!user) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(user, update.$set);
      if (update.$inc?.sessionVersion) {
        user.sessionVersion = (user.sessionVersion || 0) + update.$inc.sessionVersion;
      }
      state.writes += 1;
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async deleteOne(filter) {
      state.users = state.users.filter((entry) => !matches(entry, filter));
    },
  },
  UserData: {
    async create() {
      state.writes += 1;
      return { _id: "dddddddddddddddddddddddd" };
    },
    async deleteOne() {
      state.writes += 1;
    },
  },
  Playlist: {},
  Genre: {},
};

register(new URL("./support/api-loader.mjs", import.meta.url));

const signupRoute = await import("../src/app/api/signup/route.js");
const resendRoute = await import("../src/app/api/resend-verification/route.js");
const verifyRoute = await import("../src/app/api/verify-email/route.js");
const resetRoute = await import("../src/app/api/forgotPassword/route.js");

function request(path, method = "POST", body, origin = canonicalOrigin) {
  return new Request(`${canonicalOrigin}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_URL = canonicalOrigin;
  process.env.NEXT_PUBLIC_APP_URL = canonicalOrigin;
  state = {
    users: [],
    connections: 0,
    writes: 0,
    mails: [],
    mailFailure: false,
  };
});

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("signup normalizes public-provider email and emits a canonical verification link", async () => {
  const response = await signupRoute.POST(request("/api/signup", "POST", {
    userName: "Listener",
    email: " Listener+music@GMAIL.com ",
    password: "fixture-password-123",
  }));
  assert.equal(response.status, 201);
  assert.equal(state.users[0].email, "listener+music@gmail.com");
  assert.equal(state.mails.length, 1);
  assert.match(state.mails[0][2], /https:\/\/haykasa\.vercel\.app\/verify-email\/[a-f0-9]{64}/);
  assert.equal(state.mails[0][2].includes("spotify-clone-iota-pink"), false);
});

test("verification requires a trusted explicit POST and consumes its token once", async () => {
  const token = "a".repeat(64);
  state.users.push(attachSave({
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    email: "listener@example.com",
    isVerified: false,
    verificationToken: hashToken(token),
    verificationTokenExpires: Date.now() + 60_000,
  }));

  assert.equal(
    (await verifyRoute.POST(request("/api/verify-email", "POST", { token }, null))).status,
    403,
  );
  assert.equal(
    (await verifyRoute.POST(request(
      "/api/verify-email",
      "POST",
      { token },
      "https://foreign.example",
    ))).status,
    403,
  );
  assert.equal(
    (await verifyRoute.POST(request("/api/verify-email", "POST", { token }))).status,
    200,
  );
  assert.equal(state.users[0].isVerified, true);
  assert.equal(state.users[0].verificationToken, null);
  assert.equal(
    (await verifyRoute.POST(request("/api/verify-email", "POST", { token }))).status,
    400,
  );
});

test("expired verification tokens fail without changing the account", async () => {
  const token = "b".repeat(64);
  state.users.push(attachSave({
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
    email: "expired@example.com",
    isVerified: false,
    verificationToken: hashToken(token),
    verificationTokenExpires: Date.now() - 1,
  }));
  const response = await verifyRoute.POST(
    request("/api/verify-email", "POST", { token }),
  );
  assert.equal(response.status, 400);
  assert.equal(state.users[0].isVerified, false);
});

test("resend restores the previous usable token when SMTP fails", async () => {
  const previousToken = hashToken("c".repeat(64));
  const previousExpiry = new Date(Date.now() + 30_000);
  state.users.push(attachSave({
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    email: "listener@example.com",
    userName: "Listener",
    isVerified: false,
    verificationToken: previousToken,
    verificationTokenExpires: previousExpiry,
  }));
  state.mailFailure = true;

  const response = await resendRoute.POST(request(
    "/api/resend-verification",
    "POST",
    { email: "LISTENER@example.com" },
  ));
  assert.equal(response.status, 200);
  assert.equal(state.users[0].verificationToken, previousToken);
  assert.equal(state.users[0].verificationTokenExpires, previousExpiry);
  assert.match((await response.json()).message, /If an unverified account exists/);
});

test("password reset mail failure restores the previous token and stays generic", async () => {
  const previousToken = hashToken("d".repeat(64));
  const previousExpiry = new Date(Date.now() + 30_000);
  state.users.push(attachSave({
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    email: "listener@example.com",
    resetPasswordToken: previousToken,
    resetPasswordExpires: previousExpiry,
  }));
  state.mailFailure = true;

  const response = await resetRoute.POST(request(
    "/api/forgotPassword",
    "POST",
    { email: "listener@example.com" },
  ));
  assert.equal(response.status, 200);
  assert.equal(state.users[0].resetPasswordToken, previousToken);
  assert.equal(state.users[0].resetPasswordExpires, previousExpiry);
  assert.match((await response.json()).message, /If an account matches/);
});
