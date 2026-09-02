import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeUserErrorCode,
  safeUserErrorOverride,
} from "../src/utils/userErrorMapping.mjs";

test("user error mapping normalizes HTTP and API aliases", () => {
  assert.equal(normalizeUserErrorCode(null, 401), "UNAUTHORIZED");
  assert.equal(normalizeUserErrorCode("BAD_GATEWAY"), "UNAVAILABLE");
  assert.equal(normalizeUserErrorCode("abort-error"), "TIMEOUT");
  assert.equal(normalizeUserErrorCode("not-a-real-code"), "UNKNOWN");
});

test("user error overrides reject technical implementation details", () => {
  assert.equal(safeUserErrorOverride("Please try another search."), "Please try another search.");
  assert.equal(safeUserErrorOverride("MongoServerError: duplicate key"), "");
  assert.equal(safeUserErrorOverride("TypeError at app.js:1:2"), "");
});
