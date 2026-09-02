import assert from "node:assert/strict";
import test from "node:test";

import { hashToken } from "../src/utils/tokenHash.mjs";

test("hashToken returns a deterministic SHA-256 hex digest", () => {
  assert.equal(
    hashToken("test"),
    "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  );
  assert.match(hashToken("another-token"), /^[a-f0-9]{64}$/);
});
