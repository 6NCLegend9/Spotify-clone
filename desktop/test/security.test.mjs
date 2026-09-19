import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrustedOrigins,
  isSafeDesktopOpenUrl,
  isSafeExternalUrl,
  isSafeHeyKasaDeepLink,
  isTrustedRendererUrl,
  shouldAllowRendererNavigation,
} from "../src/security.mjs";
import { PRODUCTION_APP_URL } from "../src/config.mjs";

test("packaged desktop trusts only the production HayKasa origin", () => {
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
  assert.equal(isSafeExternalUrl("https://user:pass@discord.com/"), false);
  assert.equal(isSafeExternalUrl("file:///C:/Windows/System32/calc.exe"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
});

test("desktop sign-in may open loopback HTTP only when unpackaged", () => {
  assert.equal(isSafeDesktopOpenUrl("https://haykasa.vercel.app/api/desktop/auth/authorize"), true);
  assert.equal(isSafeDesktopOpenUrl("http://localhost:3003/api/desktop/auth/authorize"), false);
  assert.equal(isSafeDesktopOpenUrl("http://localhost:3003/api/desktop/auth/authorize", { allowLoopbackHttp: true }), true);
  assert.equal(isSafeDesktopOpenUrl("http://example.com/login", { allowLoopbackHttp: true }), false);
});

test("main-frame navigation stays on trusted origins; iframes may leave", () => {
  const origins = buildTrustedOrigins({ appUrl: PRODUCTION_APP_URL, isPackaged: true });
  assert.equal(shouldAllowRendererNavigation("https://haykasa.vercel.app/search", origins, { isMainFrame: true }), true);
  assert.equal(shouldAllowRendererNavigation("https://evil.example/", origins, { isMainFrame: true }), false);
  assert.equal(shouldAllowRendererNavigation("https://www.youtube.com/embed/abc", origins, { isMainFrame: false }), true);
});

test("deep links accept only reserved HayKasa commands", () => {
  assert.equal(isSafeHeyKasaDeepLink("heykasa://open/song/abc"), true);
  assert.equal(isSafeHeyKasaDeepLink("heykasa://auth/callback?code=abc"), true);
  assert.equal(isSafeHeyKasaDeepLink("heykasa://shell/anything"), false);
  assert.equal(isSafeHeyKasaDeepLink("https://haykasa.vercel.app"), false);
});
