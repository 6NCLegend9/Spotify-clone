import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const originalFetch = globalThis.fetch;
const originalEnv = {
  manifestUrl: process.env.HEYKASA_DESKTOP_MANIFEST_URL,
  manifestSecret: process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET,
  latest: process.env.HEYKASA_DESKTOP_LATEST_VERSION,
  minimum: process.env.HEYKASA_DESKTOP_MINIMUM_VERSION,
  download: process.env.HEYKASA_DESKTOP_DOWNLOAD_URL,
  sha512: process.env.HEYKASA_DESKTOP_SHA512,
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
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test.afterEach(restoreEnvironment);

test("desktop manifest uses server-owned fallback configuration", async () => {
  delete process.env.HEYKASA_DESKTOP_MANIFEST_URL;
  process.env.HEYKASA_DESKTOP_LATEST_VERSION = "1.2.3";
  process.env.HEYKASA_DESKTOP_MINIMUM_VERSION = "1.1.0";
  process.env.HEYKASA_DESKTOP_DOWNLOAD_URL = "https://downloads.example.com/HeyKasa-Setup.exe";
  process.env.HEYKASA_DESKTOP_SHA512 = `${"A".repeat(86)}==`;

  const response = await GET();
  const payload = await response.json();
  assert.equal(payload.latest, "1.2.3");
  assert.equal(payload.minimum, "1.1.0");
  assert.equal(payload.published, true);
  assert.equal(payload.downloadUrl, "https://downloads.example.com/HeyKasa-Setup.exe");
  assert.equal(payload.sha512, `${"A".repeat(86)}==`);
});

test("desktop manifest accepts a correctly signed remote payload", async () => {
  const secret = "desktop-manifest-test-secret-32-bytes-minimum";
  const payload = {
    latest: "2.0.0",
    minimum: "1.5.0",
    recommended: "2.0.0",
    desktopApiVersion: 2,
    channel: "stable",
    downloadUrl: "https://downloads.example.com/HeyKasa-Setup-2.0.0.exe",
    sha512: `${"B".repeat(86)}==`,
  };
  const signature = crypto.createHmac("sha256", secret).update(JSON.stringify(payload), "utf8").digest("base64url");

  process.env.HEYKASA_DESKTOP_MANIFEST_URL = "https://downloads.example.com/manifest.json";
  process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET = secret;
  globalThis.fetch = async () => new Response(JSON.stringify({ payload, signature }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const response = await GET(new Request("https://haykasa.vercel.app/api/desktop/manifest?channel=stable"));
  const result = await response.json();
  assert.equal(result.latest, "2.0.0");
  assert.equal(result.minimum, "1.5.0");
  assert.equal(result.desktopApiVersion, 2);
  assert.equal(result.sha512, `${"B".repeat(86)}==`);
  assert.equal(result.published, true);
});

test("desktop manifest rejects an unsigned or modified remote payload", async () => {
  process.env.HEYKASA_DESKTOP_MANIFEST_URL = "https://downloads.example.com/manifest.json";
  process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET = "desktop-manifest-test-secret-32-bytes-minimum";
  process.env.HEYKASA_DESKTOP_LATEST_VERSION = "1.0.0";
  delete process.env.HEYKASA_DESKTOP_DOWNLOAD_URL;
  globalThis.fetch = async () => new Response(JSON.stringify({
    payload: {
      latest: "99.0.0",
      minimum: "99.0.0",
      downloadUrl: "https://evil.example/fake.exe",
    },
    signature: "A".repeat(43),
  }), { status: 200 });

  const response = await GET(new Request("https://haykasa.vercel.app/api/desktop/manifest?channel=stable"));
  const result = await response.json();
  assert.equal(result.latest, "1.0.0");
  assert.equal(result.minimum, "1.0.0");
  assert.equal(result.published, false);
  assert.equal(result.downloadUrl, "");
});
