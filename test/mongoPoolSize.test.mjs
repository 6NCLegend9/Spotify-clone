import assert from "node:assert/strict";
import test from "node:test";
import { mongoPoolSize } from "../src/utils/mongoPoolSize.mjs";

test("Mongo pool permits parallel startup reads with a bounded configurable cap", () => {
  assert.equal(mongoPoolSize(undefined), 5);
  for (const value of ["", "0", "-1", "1.5", "bad", "101", "Infinity"]) {
    assert.equal(mongoPoolSize(value), 5);
  }
  for (const value of ["1", "5", "10", "100"]) {
    assert.equal(mongoPoolSize(value), Number(value));
  }
});