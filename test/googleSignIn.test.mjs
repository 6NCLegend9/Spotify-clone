import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";
let user, writes, created;
const query = (value) => ({ select() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
globalThis.__apiFixtures = {
  connect() {},
  User: {
    findOne() { return query(user); },
    async create(value) { writes++; created = value; },
    async findOneAndUpdate(filter, update) {
      assert.equal(filter._id, user._id);
      assert.equal(filter.isVerified, true);
      assert.equal(filter.$and.length, 2);
      if (user.race) return null;
      writes++;
      Object.assign(user, update.$set);
      return user;
    },
  },
  UserData: {
    async create() { writes++; return { _id: "library" }; },
    async findById() { return { _id: "library" }; },
    async deleteOne() { writes++; },
  },
};
register(new URL("./support/api-loader.mjs", import.meta.url));
const { authOptions } = await import("../src/utils/authOptions.js");
const signIn = (overrides = {}) => authOptions.callbacks.signIn({ account: { provider: "google" }, profile: { email: "owner@example.com", name: "Owner", email_verified: true, sub: "google-owner", ...overrides } });
beforeEach(() => { user = null; writes = 0; created = null; });
test("Google cannot activate a planted unverified password", async () => {
  user = { _id: "owner", isVerified: false, password: "attacker-hash", userData: "library" };
  assert.equal(await signIn(), false);
  assert.equal(user.isVerified, false);
  assert.equal(writes, 0);
});
test("verified credential accounts are not silently linked by email", async () => {
  user = { _id: "owner", isVerified: true, password: "owner-hash", userData: "library" };
  assert.equal(await signIn(), false);
  assert.equal(writes, 0);
});
test("Google requires an explicitly verified email and a stable subject", async () => {
  for (const value of [false, undefined, null, "true"]) assert.equal(await signIn({ email_verified: value }), false);
  assert.equal(await signIn({ sub: "" }), false);
  assert.equal(writes, 0);
});
test("new Google accounts have a pinned subject and no password", async () => {
  assert.equal(await signIn(), true);
  assert.equal(created.googleSubject, "google-owner");
  assert.equal(created.isVerified, true);
  assert.equal(created.password, undefined);
});
test("legacy Google-only accounts are pinned, while mismatched subjects fail", async () => {
  user = { _id: "owner", isVerified: true, userData: "library" };
  assert.equal(await signIn(), true);
  assert.equal(user.googleSubject, "google-owner");
  assert.equal(await signIn({ sub: "different-owner" }), false);
  assert.equal(await signIn(), true);
  assert.equal(writes, 1);
});
test("a concurrent change cannot bypass the legacy account linking guard", async () => {
  user = { _id: "owner", isVerified: true, userData: "library", race: true };
  assert.equal(await signIn(), false);
  assert.equal(writes, 0);
});
