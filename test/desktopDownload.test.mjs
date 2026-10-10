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
    if (text.endsWith("/latest.yml")) {
      const installer = `HayKasa-Setup-${version}-x64.exe`;
      return new Response([
        `version: ${version}`,
        "files:",
        `  - url: ${installer}`,
        `    sha512: ${"B".repeat(86)}==`,
        "    size: 123456",
        `path: ${installer}`,
        `sha512: ${"B".repeat(86)}==`,
      ].join("\n"), { status: 200, headers: { "content-type": "text/yaml" } });
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

const legacyUrl = "https://github.com/6NCLegend9/Spotify-clone/releases/download/desktop-latest/HayKasa-Setup-x64.exe";
function legacyRelease(overrides = {}) {
  return {
    tag_name: "desktop-latest", draft: false, prerelease: true,
    published_at: "2026-09-22T07:50:02Z",
    assets: [{ name: "HayKasa-Setup-x64.exe", state: "uploaded", size: 110799796,
      digest: "sha256:5f163cdf097b30ecc5a83e48602ed301890f8df66f04751dae034f90e7c9f36b", browser_download_url: legacyUrl }],
    ...overrides,
  };
}
function mockLegacy(value = legacyRelease()) {
  globalThis.fetch = async url => new Response(JSON.stringify(
    String(url).endsWith("/releases/tags/desktop-latest") ? value : []
  ), { status: 200, headers: { "content-type": "application/json" } });
}

test("manual download redirects to the existing pinned installer without publishing an automatic update", async () => {
  mockLegacy();
  const response = await GET();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), legacyUrl);
  const { GET: manifest } = await import("../src/app/api/desktop/manifest/route.js");
  const data = await (await manifest()).json();
  assert.equal(data.published, false);
  assert.equal(data.signed, false);
  assert.equal(data.downloadUrl, "");
  assert.equal(data.manualDownload.downloadUrl, "/api/desktop/download");
  assert.equal(data.manualDownload.sizeBytes, 110799796);
});

test("manual installer fallback rejects replacement assets and external URLs", async () => {
  for (const changes of [
    { name: "Other-Setup.exe" }, { digest: undefined },
    { digest: "sha256:" + "0".repeat(64) },
    { browser_download_url: "https://example.com/installer.exe" },
    { state: "new" }, { size: 0 },
  ]) {
    const value = legacyRelease();
    Object.assign(value.assets[0], changes);
    mockLegacy(value);
    assert.equal((await GET()).status, 404);
  }
  for (const changes of [{ draft: true }, { tag_name: "other-release" }, { assets: [] }]) {
    mockLegacy(legacyRelease(changes));
    assert.equal((await GET()).status, 404);
  }
});

test("HEAD offers the same existing installer as GET", async () => {
  mockLegacy();
  const { HEAD } = await import("../src/app/api/desktop/download/route.js");
  const response = await HEAD();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), legacyUrl);
  assert.equal(await response.text(), "");
});


test("manual download stays unavailable when GitHub fails", async () => {
  globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
  assert.equal((await GET()).status, 404);
});
