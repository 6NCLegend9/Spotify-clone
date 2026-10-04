import assert from "node:assert/strict";
import test from "node:test";
import { verifyDesktopProductionRelease } from "../scripts/verify-desktop-production-release.mjs";

const expected = {
  latest: "1.1.0",
  channel: "stable",
  signed: true,
  published: true,
  downloadUrl: "https://github.com/6NCLegend9/Spotify-clone/releases/download/desktop-v1.1.0/HayKasa-Setup-1.1.0-x64.exe",
  releaseNotesUrl: "https://haykasa.vercel.app/releases/1.1.0",
  sha512: `${"B".repeat(86)}==`,
  sizeBytes: 123456,
};

function responseJson(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

test("production release verifier binds manifest, updater metadata, and stable installer redirect", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(String(url));
    calls.push({ pathname: parsed.pathname, method: options.method || "GET", redirect: options.redirect });
    if (parsed.pathname === "/api/desktop/manifest") {
      return responseJson({ ...expected, updateRolloutPercent: 25 });
    }
    if (parsed.pathname === "/api/desktop/update/stable/latest.yml") {
      return new Response(null, {
        status: 307,
        headers: { location: "https://github.com/6NCLegend9/Spotify-clone/releases/download/desktop-v1.1.0/latest.yml" },
      });
    }
    if (parsed.pathname === "/api/desktop/download") {
      return new Response(null, { status: 302, headers: { location: expected.downloadUrl } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await verifyDesktopProductionRelease({
    baseUrl: "https://haykasa.vercel.app",
    channel: "stable",
    expected,
    fetchImpl,
    attempts: 1,
    delayMs: 0,
  });

  assert.equal(result.latest, expected.latest);
  assert.deepEqual(calls.map((call) => call.pathname), [
    "/api/desktop/manifest",
    "/api/desktop/update/stable/latest.yml",
    "/api/desktop/download",
  ]);
  assert.equal(calls[2].method, "HEAD");
});

test("production release verifier fails closed on integrity mismatch", async () => {
  await assert.rejects(
    verifyDesktopProductionRelease({
      baseUrl: "https://haykasa.vercel.app",
      channel: "stable",
      expected,
      attempts: 1,
      delayMs: 0,
      fetchImpl: async (url) => {
        const parsed = new URL(String(url));
        if (parsed.pathname === "/api/desktop/manifest") {
          return responseJson({ ...expected, sha512: `${"C".repeat(86)}==`, updateRolloutPercent: 25 });
        }
        throw new Error("verification should stop at the manifest mismatch");
      },
    }),
    /SHA-512/,
  );
});
