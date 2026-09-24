import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { desktopReleaseTag } from "../src/utils/desktopRelease.mjs";

const originalFetch = globalThis.fetch;
const originalSecret = process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET;

const { GET } = await import("../src/app/api/desktop/download/route.js");

function restore() {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET;
  else process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET = originalSecret;
}

test.afterEach(restore);

function release(version = "2.0.0") {
  const installer = `HayKasa-Setup-${version}-x64.exe`;
  return {
    draft: false,
    prerelease: false,
    tag_name: desktopReleaseTag("stable", version),
    published_at: "2026-09-24T12:00:00Z",
    assets: [
      { name: "latest.yml" },
      { name: "release-manifest.json" },
      { name: installer },
      { name: `${installer}.blockmap` },
    ],
  };
}

function payload(version = "2.0.0") {
  const tag = desktopReleaseTag("stable", version);
  return {
    latest: version,
    minimum: "1.0.0",
    recommended: version,
    desktopApiVersion: 1,
    channel: "stable",
    platform: "win32",
    arch: "x64",
    downloadUrl: `https://github.com/6NCLegend9/Spotify-clone/releases/download/${tag}/HayKasa-Setup-${version}-x64.exe`,
    releaseNotesUrl: "",
    publishedAt: "2026-09-24T12:00:00.000Z",
    sizeBytes: 123456,
    sha512: `${"B".repeat(86)}==`,
    updateRolloutPercent: 100,
    signed: true,
    source: "github-release",
  };
}

function signedEnvelope(value, secret) {
  return {
    payload: value,
    signature: crypto.createHmac("sha256", secret).update(JSON.stringify(value), "utf8").digest("base64url"),
  };
}

function mockRelease(envelope, version = "2.0.0") {
  const githubRelease = release(version);
  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("api.github.com/repos/6NCLegend9/Spotify-clone/releases")) {
      return new Response(JSON.stringify([githubRelease]), { status: 200 });
    }
    if (text.endsWith("/release-manifest.json")) {
      return new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch: ${text}`);
  };
}

test("public desktop download rejects a structurally complete release without a trusted signed manifest", async () => {
  process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET = "desktop-manifest-test-secret-32-bytes-minimum";
  mockRelease({ payload: payload(), signature: "A".repeat(43) });

  const response = await GET();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
});

test("public desktop download redirects only after the stable release manifest verifies", async () => {
  const secret = "desktop-manifest-test-secret-32-bytes-minimum";
  process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET = secret;
  mockRelease(signedEnvelope(payload(), secret));

  const response = await GET();
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://github.com/6NCLegend9/Spotify-clone/releases/download/desktop-v2.0.0/HayKasa-Setup-2.0.0-x64.exe",
  );
});
