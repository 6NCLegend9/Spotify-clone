import assert from "node:assert/strict";
import { register } from "node:module";
import test, { afterEach } from "node:test";

register(new URL("./support/api-loader.mjs", import.meta.url));

const {
  isSuccessfulAuthResponseUrl,
  loginPath,
  safeReturnPath,
} = await import("../src/utils/appOrigin.mjs");
const { isAuthPath } = await import("../src/utils/authPaths.mjs");
const {
  normalizeEmail,
  validateEmail,
} = await import("../src/utils/authErrors.js");
const {
  isTrustedRequestOrigin,
  trustedAppOrigins,
} = await import("../src/utils/trustedOrigin.js");
const { getAppLink, getAppUrl } = await import("../src/utils/appUrl.js");

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) restoreEnv(key, value);
});

test("production links always use the canonical HeyKasa origin", () => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_URL = "https://spotify-clone-iota-pink.vercel.app";
  process.env.NEXT_PUBLIC_APP_URL = "https://attacker.example";
  const request = new Request("https://untrusted.example/verify-email/token");

  assert.equal(getAppUrl(request), "https://haykasa.vercel.app");
  assert.equal(
    getAppLink("/verify-email/abc", request),
    "https://haykasa.vercel.app/verify-email/abc",
  );
  assert.deepEqual([...trustedAppOrigins()], ["https://haykasa.vercel.app"]);
});

test("development links accept only an explicit loopback origin", () => {
  process.env.NODE_ENV = "development";
  process.env.NEXTAUTH_URL = "http://localhost:3003";
  process.env.NEXT_PUBLIC_APP_URL = "https://untrusted.example";

  assert.equal(
    getAppUrl(new Request("http://127.0.0.1:3000/reset-password/token")),
    "http://127.0.0.1:3000",
  );
  assert.equal(
    getAppUrl(new Request("https://untrusted.example/reset-password/token")),
    "http://localhost:3003",
  );
});

test("trusted origin checks reject missing and foreign mutation origins", () => {
  process.env.NODE_ENV = "development";
  process.env.NEXTAUTH_URL = "http://localhost:3003";

  const sameOrigin = new Request("http://localhost:3003/api/account/sessions", {
    headers: { Origin: "http://localhost:3003" },
  });
  const foreign = new Request("http://localhost:3003/api/account/sessions", {
    headers: { Origin: "https://foreign.example" },
  });
  const missing = new Request("http://localhost:3003/api/account/sessions");

  assert.equal(isTrustedRequestOrigin(sameOrigin), true);
  assert.equal(isTrustedRequestOrigin(foreign), false);
  assert.equal(isTrustedRequestOrigin(missing), false);
});

test("return paths preserve same-origin URLs and reject open redirects", () => {
  const base = "http://localhost:3003";
  assert.equal(safeReturnPath("/library?view=liked#songs", base), "/library?view=liked#songs");
  assert.equal(safeReturnPath(`${base}/jam/ABC123`, base), "/jam/ABC123");
  for (const value of [
    "https://foreign.example/account",
    "//foreign.example/account",
    "%2F%2Fforeign.example/account",
    "/%5C%5Cforeign.example/account",
    "javascript:alert(1)",
  ]) {
    assert.equal(safeReturnPath(value, base), "/");
  }
  assert.equal(loginPath("/library", base), "/login?callbackUrl=%2Flibrary");
});

test("auth response URLs reject CSRF, error, and foreign-host false successes", () => {
  const base = "http://localhost:3003";
  assert.equal(isSuccessfulAuthResponseUrl(`${base}/library`, base), true);
  assert.equal(isSuccessfulAuthResponseUrl(`${base}/login?csrf=true`, base), false);
  assert.equal(isSuccessfulAuthResponseUrl(`${base}/login?error=Callback`, base), false);
  assert.equal(isSuccessfulAuthResponseUrl("https://foreign.example/library", base), false);
});

test("auth paths cover login, signup, and token pages only", () => {
  for (const path of [
    "/login",
    "/signup",
    "/resend-verification",
    "/reset-password/token",
    "/verify-email/token",
  ]) {
    assert.equal(isAuthPath(path), true);
  }
  for (const path of ["/", "/library", "/login-help"]) {
    assert.equal(isAuthPath(path), false);
  }
});

test("email normalization accepts common providers, subdomains, and plus addressing", () => {
  for (const email of [
    "Person+music@GMAIL.com",
    "listener@outlook.co.uk",
    "name.surname@yahoo.com",
    "user@subdomain.proton.me",
    "listener@icloud.com",
  ]) {
    assert.equal(validateEmail(email), null);
  }
  assert.equal(normalizeEmail("  Person+music@GMAIL.com "), "person+music@gmail.com");
  for (const email of ["a@b", ".name@example.com", "name..two@example.com", "name@\nexample.com"]) {
    assert.notEqual(validateEmail(email), null);
  }
});
