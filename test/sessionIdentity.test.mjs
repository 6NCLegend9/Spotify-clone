import assert from "node:assert/strict";
import test from "node:test";
import { hasSessionIdentity, isCurrentSession, sessionIdentity } from "../src/utils/sessionIdentity.mjs";

const account = { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", email: "account@example.test", isVerified: true };

test("only verified immutable account identities receive versioned sessions", () => {
  const token = sessionIdentity(account);
  assert.deepEqual(token, { id: account._id, sub: account._id, sessionVersion: 0 });
  assert.equal(isCurrentSession(token, account), true);
  assert.equal(sessionIdentity({ ...account, isVerified: false }), null);
  assert.equal(sessionIdentity({ ...account, sessionVersion: -1 }), null);
  assert.equal(sessionIdentity({ ...account, sessionVersion: 1.5 }), null);
});

test("password-reset version changes revoke old tokens without refreshing their version", () => {
  const token = sessionIdentity(account);
  const afterReset = { ...account, sessionVersion: 1 };
  assert.equal(isCurrentSession(token, afterReset), false);
  assert.equal(isCurrentSession(sessionIdentity(afterReset), afterReset), true);
  assert.equal(token.sessionVersion, 0);
});

test("deleted or re-created accounts cannot inherit a previous account's session by email", () => {
  const token = { ...sessionIdentity(account), email: account.email };
  assert.equal(isCurrentSession(token, null), false);
  assert.equal(isCurrentSession(token, { ...account, _id: "bbbbbbbbbbbbbbbbbbbbbbbb" }), false);
  assert.equal(isCurrentSession(token, { ...account, isVerified: false }), false);
});

test("legacy, malformed, mismatched and unversioned tokens require reauthentication", () => {
  for (const token of [null, {}, { email: account.email }, { id: account._id },
    { id: account._id, sub: account._id },
    { id: account._id, sub: "different-account", sessionVersion: 0 },
    { id: account._id, sub: account._id, sessionVersion: "0" },
    { id: account._id, sub: account._id, sessionVersion: -1 },
    { id: "not-an-object-id", sub: "not-an-object-id", sessionVersion: 0 }]) {
    assert.equal(hasSessionIdentity(token), false);
    assert.equal(isCurrentSession(token, account), false);
  }
});