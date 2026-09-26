import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { desktopReleaseTag } from "../src/utils/desktopRelease.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = {
  manifestUrl: process.env.HEYKASA_DESKTOP_MANIFEST_URL,
  manifestSecret: process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET,
  latest: process.env.HEYKASA_DESKTOP_LATEST_VERSION,
  minimum: process.env.HEYKASA_DESKTOP_MINIMUM_VERSION,
  download: process.env.HEYKASA_DESKTOP_DOWNLOAD_URL,
  sha512: process.env.HEYKASA_DESKTOP_SHA512,
  rollout: process.env.HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT,
};

const { GET } = await import("../src/app/api/desktop/manifest/route.js");

function restoreEnvironment() {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries({
    HEYKASA_DESKTOP_MANIFEST_URL: originalEnv.manifestUrl,
    HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET: originalEnv.manifestSecret,
    HEYKASA_DESKTOP_LATEST_VERSION: originalEnv.latest,
    HEYKASA_DESKTOP_MINIMUM_VERSION: originalEnv.minimum,
    HEYKASA_DESKTOP_DOWNLOAD_URL: originalEnv.download,
    HEYKASA_DESKTOP_SHA512: originalEnv.sha512,
    HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT: originalEnv.rollout,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test.afterEach(restoreEnvironment);

function releaseFixture(channel, version, overrides = {}) {
  const tag = desktopReleaseTag(channel, version);
  const installer = `HayKasa-Setup-${version}-x64.exe`;
  return {
    draft: false,
    prerelease: channel !== "stable",
    tag_name: tag,
    published_at: "2026-09-23T12:00:00Z",
    assets: [
      { name: "latest.yml" },
      { name: "release-manifest.json" },
      { name: installer },
      { name: `${installer}.blockmap` },
    ],
    ...overrides,
  };
}

function releasePayload(channel, version, overrides = {}) {
  const tag = desktopReleaseTag(channel, version);
  return {
    latest: version,
    minimum: "1.0.0",
    recommended: version,
    desktopApiVersion: 1,
    channel,
    platform: "win32",
    arch: "x64",
    downloadUrl: `https://github.com/6NCLegend9/Spotify-clone/releases/download/${tag}/HayKasa-Setup-${version}-x64.exe`,
    releaseNotesUrl: "",
    publishedAt: "2026-09-23T12:00:00.000Z",
    sizeBytes: 123456,
    sha512: `${"B".repeat(86)}==`,
    updateRolloutPercent: 100,
    signed: channel !== "internal",
    source: "github-release",
    ...overrides,
  };
}

function signedEnvelope(payload, secret) {
  return {
    payload,
    signature: crypto.createHmac("sha256", secret).update(JSON.stringify(payload), "utf8").digest("base64url"),
  };
}

function mockGithubRelease(channel, version, envelope, releaseOverrides = {}, latestYml = "") {
  const release = releaseFixture(channel, version, releaseOverrides);
  const installer = `HayKasa-Setup-${version}-x64.exe`;
  const metadata = latestYml || [
    `version: ${version}`,
    "files:",
    `  - url: ${installer}`,
    `    sha512: ${"B".repeat(86)}==`,
    "    size: 123456",
    `path: ${installer}`,
    `sha512: ${"B".repeat(86)}==`,
  ].join("\n");
  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("api.github.com/repos/6NCLegend9/Spotify-clone/releases")) {
      return new Response(JSON.stringify([release]), { status: 200 });
    }
    if (text.endsWith("/release-manifest.json")) {
      return new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (text.endsWith("/latest.yml")) {
      return new Response(metadata, { status: 200, headers: { "content-type": "text/yaml" } });
    }
    throw new Error(`Unexpected fetch: ${text}`);
  };
}

test("desktop manifest does not advertise unsigned stable fallback configuration", async () => {
  delete process.env.HEYKASA_DESKTOP_MANIFEST_URL;
  process.env.HEYKASA_DESKTOP_LATEST_VERSION = "1.2.3";
  process.env.HEYKASA_DESKTOP_MINIMUM_VERSION = "1.1.0";
  process.env.HEYKASA_DESKTOP_DOWNLOAD_URL = "https://downloads.example.com/HayKasa-Setup.exe";
  process.env.HEYKASA_DESKTOP_SHA512 = `${"A".repeat(86)}==`;
  process.env.HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT = "25";
  globalThis.fetch = async () => new Response("[]", { status: 200 });

  const response = await GET(new Request("https://haykasa.vercel.app/api/desktop/manifest?channel=stable"));
  const payload = await response.json();
  assert.equal(payload.latest, "1.2.3");
  assert.equal(payload.minimum, "1.1.0");
  assert.equal(payload.published, false);
  assert.equal(payload.downloadUrl, "");
  assert.equal(payload.sha512, "");
  assert.equal(payload.updateRolloutPercent, 25);
  assert.equal(payload.signed, false);
  assert.equal(payload.source, "none");
});

test("complete signed GitHub stable releases become the compatibility manifest", async () => {
  const secret = "desktop-manifest-test-secret-32-bytes-minimum";
  const payload = releasePayload("stable", "2.0.0", { updateRolloutPercent: 40 });
  process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET = secret;
  delete process.env.HEYKASA_DESKTOP_MANIFEST_URL;
  delete process.env.HEYKASA_DESKTOP_DOWNLOAD_URL;
  delete process.env.HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT;
  mockGithubRelease("stable", "2.0.0", signedEnvelope(payload, secret));

  const response = await GET(new Request("https://haykasa.vercel.app/api/desktop/manifest?channel=stable"));
  const result = await response.json();
  assert.equal(result.latest, "2.0.0");
  assert.equal(result.minimum, "1.0.0");
  assert.equal(result.sha512, `${"B".repeat(86)}==`);
  assert.equal(result.updateRolloutPercent, 40);
  assert.equal(result.published, true);
  assert.equal(result.signed, true);
  assert.equal(result.source, "github-release");
  assert.match(result.downloadUrl, /github\.com\/6NCLegend9\/Spotify-clone\/releases\/download\/desktop-v2\.0\.0/);
});

test("stable rollout environment overrides the signed GitHub release percentage", async () => {
  const secret = "desktop-manifest-test-secret-32-bytes-minimum";
  const payload = releasePayload("stable", "2.0.0", { updateRolloutPercent: 100 });
  process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET = secret;
  process.env.HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT = "10";
  mockGithubRelease("stable", "2.0.0", signedEnvelope(payload, secret));

  const response = await GET(new Request("https://haykasa.vercel.app/api/desktop/manifest?channel=stable"));
  const result = await response.json();
  assert.equal(result.updateRolloutPercent, 10);
});

test("tampered GitHub release manifests fail closed", async () => {
  process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET = "desktop-manifest-test-secret-32-bytes-minimum";
  delete process.env.HEYKASA_DESKTOP_MANIFEST_URL;
  delete process.env.HEYKASA_DESKTOP_DOWNLOAD_URL;
  delete process.env.HEYKASA_DESKTOP_LATEST_VERSION;
  delete process.env.HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT;
  mockGithubRelease("stable", "2.0.0", {
    payload: releasePayload("stable", "2.0.0", { downloadUrl: "https://evil.example/fake.exe" }),
    signature: "A".repeat(43),
  });

  const response = await GET(new Request("https://haykasa.vercel.app/api/desktop/manifest?channel=stable"));
  const result = await response.json();
  assert.equal(result.latest, "1.0.0");
  assert.equal(result.published, false);
  assert.equal(result.signed, false);
  assert.equal(result.downloadUrl, "");
});

test("incomplete GitHub releases are never advertised", async () => {
  const secret = "desktop-manifest-test-secret-32-bytes-minimum";
  const payload = releasePayload("stable", "2.0.0");
  process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET = secret;
  mockGithubRelease("stable", "2.0.0", signedEnvelope(payload, secret), {
    assets: releaseFixture("stable", "2.0.0").assets.filter((asset) => !asset.name.endsWith(".blockmap")),
  });

  const response = await GET(new Request("https://haykasa.vercel.app/api/desktop/manifest?channel=stable"));
  const result = await response.json();
  assert.equal(result.published, false);
  assert.equal(result.signed, false);
});

test("internal GitHub previews stay explicitly unsigned", async () => {
  const payload = releasePayload("internal", "2.1.0-internal.4", { signed: false });
  delete process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET;
  mockGithubRelease("internal", "2.1.0-internal.4", { payload, signature: "" });

  const response = await GET(new Request("https://haykasa.vercel.app/api/desktop/manifest?channel=internal"));
  const result = await response.json();
  assert.equal(result.latest, "2.1.0-internal.4");
  assert.equal(result.published, true);
  assert.equal(result.signed, false);
  assert.equal(result.source, "github-release");
});


test("signed GitHub releases fail closed when latest.yml disagrees with the trusted manifest", async () => {
  const secret = "desktop-manifest-test-secret-32-bytes-minimum";
  const payload = releasePayload("stable", "2.0.0");
  process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET = secret;
  delete process.env.HEYKASA_DESKTOP_MANIFEST_URL;
  mockGithubRelease(
    "stable",
    "2.0.0",
    signedEnvelope(payload, secret),
    {},
    [
      "version: 2.0.1",
      "files:",
      "  - url: HayKasa-Setup-2.0.1-x64.exe",
      `    sha512: ${"C".repeat(86)}==`,
      "    size: 999999",
      "path: HayKasa-Setup-2.0.1-x64.exe",
      `sha512: ${"C".repeat(86)}==`,
    ].join("\n"),
  );

  const response = await GET(new Request("https://haykasa.vercel.app/api/desktop/manifest?channel=stable"));
  const result = await response.json();
  assert.equal(result.published, false);
  assert.equal(result.signed, false);
  assert.equal(result.downloadUrl, "");
});
