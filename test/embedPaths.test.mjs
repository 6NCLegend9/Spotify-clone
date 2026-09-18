import assert from "node:assert/strict";
import test from "node:test";
import { isEmbedPath } from "../src/utils/embedPaths.mjs";

test("only embed routes skip app chrome", () => {
  assert.equal(isEmbedPath("/embed/playlist/64b000000000000000000001"), true);
  assert.equal(isEmbedPath("/embed"), true);
  assert.equal(isEmbedPath("/library/playlist/64b000000000000000000001"), false);
  assert.equal(isEmbedPath("/"), false);
});
