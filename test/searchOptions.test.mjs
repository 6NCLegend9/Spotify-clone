import assert from "node:assert/strict";
import test from "node:test";
import { readSearchOptions } from "../src/utils/searchOptions.mjs";

test("search options preserve multilingual titles and distinguish provider-only capabilities", () => {
  const basic = readSearchOptions(new URLSearchParams({ q: "  Cafe\u0301  " }));
  assert.equal(basic.query, "Café");
  assert.equal(basic.requireOfficial, false);
  const filtered = readSearchOptions(new URLSearchParams({ q: '"exact title"', type: "video", duration: "short", order: "date", pageToken: "page_token-2=" }));
  assert.equal(filtered.requireOfficial, true);
  assert.equal(filtered.pageToken, "page_token-2=");
});

test("invalid types, incompatible filters and malformed page tokens are rejected", () => {
  for (const fields of [{ q: "" }, { q: "x", type: "unknown" }, { q: "x", type: "channel", duration: "short" },
    { q: "x", duration: "invalid" }, { q: "x", order: "random" }, { q: "x", pageToken: "../private" }]) {
    assert.throws(() => readSearchOptions(new URLSearchParams(fields)), { code: "VALIDATION_ERROR" });
  }
});