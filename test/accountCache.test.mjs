import assert from "node:assert/strict";
import test from "node:test";
import { accountOwner, readAccountCache, writeAccountCache } from "../src/utils/accountCache.mjs";

test("account cache requires an immutable owner and never adopts legacy or other-account data", () => {
  const records = new Map([["home:authenticated", JSON.stringify({ private: true })]]);
  const storage = { getItem: (key) => records.get(key), setItem: (key, value) => records.set(key, value) };
  assert.equal(accountOwner({ user: { id: "a" } }, "loading"), null);
  assert.equal(accountOwner({ user: { email: "someone@example.test" } }, "authenticated"), null);
  assert.equal(accountOwner(null, "unauthenticated"), "guest");
  assert.equal(accountOwner({ user: { id: "a" } }, "authenticated"), "account:a");
  assert.equal(writeAccountCache(storage, "home", null, ["private"], 100), false);
  assert.equal(readAccountCache(storage, "home", "account:b", 50, 100), null);
  assert.equal(writeAccountCache(storage, "home", "account:a", ["private"], 100), true);
  assert.deepEqual(readAccountCache(storage, "home", "account:a", 50, 110), ["private"]);
  assert.equal(readAccountCache(storage, "home", "account:b", 50, 110), null);
  assert.equal(readAccountCache(storage, "home", "account:a", 50, 150), null);
  assert.equal(readAccountCache(storage, "home", "account:a", 50, 99), null);
  records.set("home:account%3Ab", records.get("home:account%3Aa"));
  assert.equal(readAccountCache(storage, "home", "account:b", 50, 110), null);
});

test("empty authoritative caches, corrupt data and unavailable storage are safe", () => {
  const records = new Map();
  const storage = { getItem: (key) => records.get(key), setItem: (key, value) => records.set(key, value) };
  writeAccountCache(storage, "history", "account:a", [], 100);
  assert.deepEqual(readAccountCache(storage, "history", "account:a", 50, 110), []);
  records.set("history:account%3Aa", "{");
  assert.equal(readAccountCache(storage, "history", "account:a"), null);
  assert.equal(readAccountCache(null, "history", "account:a"), null);
  assert.equal(writeAccountCache(null, "history", "account:a", []), false);
});