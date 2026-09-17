import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrustedOrigins,
  isSafeExternalUrl,
  isSafeHeyKasaDeepLink,
  isTrustedRendererUrl,
} from "../src/security.mjs";

test("packaged desktop trusts only the production HeyKasa origin", () => {
  const origins = buildTrustedOrigins({
    appUrl: "http://localhost:3000",
    isPackaged: true,
  });
  assert.equal(isTrustedRendererUrl("https://haykasa.vercel.app/settings", origins), true);
  assert.equal(isTrustedRendererUrl("http://localhost:3000/settings", origins), false);
  assert.equal(isTrustedRendererUrl("https://haykasa.vercel.app.evil.example/", origins), false);
});

test("development may opt into loopback without trusting arbitrary HTTP", () => {
  const origins = buildTrustedOrigins({
    appUrl: "http://127.0.0.1:3000",
    isPackaged: false,
  });
  assert.equal(isTrustedRendererUrl("http://127.0.0.1:3000/settings", origins), true);
  assert.equal(isTrustedRendererUrl("http://example.com/", origins), false);
});

test("only HTTPS URLs can be opened externally", () => {
  assert.equal(isSafeExternalUrl("https://discord.com/"), true);
  assert.equal(isSafeExternalUrl("http://discord.com/"), false);
  assert.equal(isSafeExternalUrl("file:///C:/Windows/System32/calc.exe"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
});

test("deep links accept only reserved HeyKasa commands", () => {
  assert.equal(isSafeHeyKasaDeepLink("heykasa://open/song/abc"), true);
  assert.equal(isSafeHeyKasaDeepLink("heykasa://auth/callback?code=abc"), true);
  assert.equal(isSafeHeyKasaDeepLink("heykasa://shell/anything"), false);
  assert.equal(isSafeHeyKasaDeepLink("https://haykasa.vercel.app"), false);
});
