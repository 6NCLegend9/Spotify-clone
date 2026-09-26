import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./support/rate-limit-loader.mjs", import.meta.url);
const { getClientKey } = await import("../src/utils/rateLimit.js");

function request(pathname = "/api/youtube-search", ip = "203.0.113.7") {
  return {
    headers: new Headers({ "x-forwarded-for": ip }),
    nextUrl: { pathname },
  };
}

test("rate-limit scope changes only the generated client key namespace", () => {
  const base = getClientKey(request());
  const interactive = getClientKey(request(), "youtube-search:interactive");
  const radio = getClientKey(request(), "youtube-search:radio");
  assert.equal(base, "/api/youtube-search:203.0.113.7");
  assert.notEqual(interactive, base);
  assert.notEqual(radio, base);
  assert.notEqual(interactive, radio);
  assert.match(interactive, /youtube-search:interactive/);
  assert.match(radio, /youtube-search:radio/);
});

test("rate-limit scope is normalized and cannot inject unbounded key text", () => {
  const scoped = getClientKey(request(), "  YouTube Search:RADIO/../../ ");
  assert.doesNotMatch(scoped, /\.\./);
  assert.ok(scoped.length < 180);
});
