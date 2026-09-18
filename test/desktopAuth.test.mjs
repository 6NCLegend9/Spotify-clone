import assert from "node:assert/strict";
import test from "node:test";
import {
  desktopPkceChallenge,
  hashDesktopAuthValue,
  normalizeDesktopAuthCode,
  normalizeDesktopAuthState,
  normalizeDesktopPkceChallenge,
  normalizeDesktopPkceVerifier,
  safeHashEqual,
  safeUtf8Equal,
} from "../src/utils/desktopAuth.mjs";

test("desktop auth validates PKCE and opaque values", () => {
  const verifier = "A".repeat(64);
  const challenge = desktopPkceChallenge(verifier);
  assert.equal(normalizeDesktopPkceVerifier(verifier), verifier);
  assert.equal(challenge.length, 43);
  assert.equal(normalizeDesktopPkceChallenge(challenge), challenge);
  assert.equal(normalizeDesktopAuthState("s".repeat(43)), "s".repeat(43));
  assert.equal(normalizeDesktopAuthCode("c".repeat(43)), "c".repeat(43));
});

test("desktop auth rejects malformed values", () => {
  assert.equal(normalizeDesktopPkceVerifier("short"), "");
  assert.equal(normalizeDesktopPkceChallenge("!".repeat(43)), "");
  assert.equal(normalizeDesktopAuthState("with spaces"), "");
  assert.equal(normalizeDesktopAuthCode("../bad"), "");
});

test("desktop auth compares hashes without exposing raw secrets", () => {
  const first = hashDesktopAuthValue("one-time-value");
  const same = hashDesktopAuthValue("one-time-value");
  const other = hashDesktopAuthValue("different-value");
  assert.equal(first.length, 64);
  assert.equal(safeHashEqual(first, same), true);
  assert.equal(safeHashEqual(first, other), false);
  assert.equal(safeUtf8Equal("pkce-challenge", "pkce-challenge"), true);
  assert.equal(safeUtf8Equal("pkce-challenge", "other-challenge"), false);
  assert.equal(safeUtf8Equal("", ""), false);
});
