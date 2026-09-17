import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_MAX_AGE_MS,
  buildDesktopAuthorizeUrl,
  createDesktopAuthAttempt,
  desktopAuthAttemptExpired,
  isMatchingDesktopAuthState,
  normalizeDesktopSessionExchange,
  parseDesktopAuthDeepLink,
} from "../src/authFlow.mjs";

test("desktop auth attempt produces PKCE authorize URL", () => {
  const attempt = createDesktopAuthAttempt(1_000);
  const url = new URL(buildDesktopAuthorizeUrl("https://haykasa.vercel.app", attempt));
  assert.equal(url.origin, "https://haykasa.vercel.app");
  assert.equal(url.pathname, "/api/desktop/auth/authorize");
  assert.equal(url.searchParams.get("state"), attempt.state);
  assert.equal(url.searchParams.get("challenge"), attempt.challenge);
  assert.equal(attempt.challenge.length, 43);
  assert.ok(attempt.verifier.length >= 43);
});

test("desktop auth deep link requires matching unexpired state", () => {
  const attempt = createDesktopAuthAttempt(10_000);
  const link = `heykasa://auth?code=${"c".repeat(43)}&state=${attempt.state}`;
  const parsed = parseDesktopAuthDeepLink(link);
  assert.ok(parsed);
  assert.equal(isMatchingDesktopAuthState(attempt, parsed.state), true);
  assert.equal(desktopAuthAttemptExpired(attempt, 10_000 + AUTH_MAX_AGE_MS + 1), true);
  assert.equal(parseDesktopAuthDeepLink("https://evil.example/auth"), null);
});

test("desktop session exchange accepts only expected cookie names", () => {
  const valid = normalizeDesktopSessionExchange({
    sessionToken: "encrypted-session-token",
    cookieName: "__Secure-next-auth.session-token",
    expiresAt: Math.floor(Date.now() / 1000) + 60,
  });
  assert.equal(valid?.cookieName, "__Secure-next-auth.session-token");
  assert.equal(normalizeDesktopSessionExchange({
    sessionToken: "token",
    cookieName: "attacker-cookie",
    expiresAt: Math.floor(Date.now() / 1000) + 60,
  }), null);
});
