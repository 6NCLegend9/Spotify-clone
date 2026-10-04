import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const DEFAULT_BASE_URL = "https://haykasa.vercel.app";

function cleanBaseUrl(value) {
  const url = new URL(String(value || DEFAULT_BASE_URL));
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Production verification base URL must be HTTPS without embedded credentials.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.href;
}

function cleanChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  if (!["stable", "beta"].includes(channel)) {
    throw new Error("Production verification channel must be stable or beta.");
  }
  return channel;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function sameText(actual, expected, label) {
  if (String(actual || "") !== String(expected || "")) {
    throw new Error(`Production ${label} does not match the published release.`);
  }
}

function expectedUpdateMetadataUrl(downloadUrl) {
  const installer = new URL(String(downloadUrl || ""));
  if (installer.protocol !== "https:" || installer.username || installer.password) {
    throw new Error("Published desktop installer URL is invalid.");
  }
  const slash = installer.pathname.lastIndexOf("/");
  if (slash < 0) throw new Error("Published desktop installer URL has no release directory.");
  installer.pathname = `${installer.pathname.slice(0, slash + 1)}latest.yml`;
  installer.search = "";
  installer.hash = "";
  return installer.href;
}

function redirectLocation(response, expectedUrl, label) {
  if (!REDIRECT_STATUS.has(response?.status)) {
    throw new Error(`Production ${label} did not return an updater redirect.`);
  }
  const location = response.headers.get("location");
  if (!location) throw new Error(`Production ${label} redirect is missing Location.`);
  const actual = new URL(location, DEFAULT_BASE_URL).href;
  if (actual !== expectedUrl) {
    throw new Error(`Production ${label} redirect does not match the published release.`);
  }
}

function validateLiveManifest(live, expected, channel) {
  if (!live || typeof live !== "object") throw new Error("Production desktop manifest is invalid.");
  if (live.published !== true) throw new Error("Production desktop manifest is not published.");
  if (live.signed !== true) throw new Error("Production desktop manifest is not signed.");
  sameText(live.channel, channel, "manifest channel");
  sameText(live.latest, expected.latest, "manifest version");
  sameText(live.minimum, expected.minimum, "minimum version");
  sameText(live.downloadUrl, expected.downloadUrl, "installer URL");
  sameText(live.releaseNotesUrl, expected.releaseNotesUrl, "release notes URL");
  sameText(live.sha512, expected.sha512, "installer SHA-512");
  if (live.sizeBytes !== expected.sizeBytes) {
    throw new Error("Production installer sizeBytes does not match the published release.");
  }
  if (
    !Number.isFinite(live.updateRolloutPercent)
    || live.updateRolloutPercent < 0
    || live.updateRolloutPercent > 100
  ) {
    throw new Error("Production desktop rollout percentage is invalid.");
  }
  return live;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function verifyDesktopProductionRelease({
  baseUrl = DEFAULT_BASE_URL,
  channel,
  expected,
  fetchImpl = globalThis.fetch,
  attempts = 24,
  delayMs = 15_000,
  sleepImpl = sleep,
} = {}) {
  if (!expected || typeof expected !== "object") {
    throw new Error("Expected desktop release payload is required.");
  }
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required.");
  const releaseChannel = cleanChannel(channel || expected.channel);
  const origin = cleanBaseUrl(baseUrl);
  const maxAttempts = positiveInteger(attempts, 24);
  const waitMs = Math.max(0, Number(delayMs) || 0);
  const updateTarget = expectedUpdateMetadataUrl(expected.downloadUrl);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const nonce = String(Date.now());
      const manifestUrl = new URL("/api/desktop/manifest", origin);
      manifestUrl.searchParams.set("channel", releaseChannel);
      manifestUrl.searchParams.set("verify", nonce);
      const manifestResponse = await fetchImpl(manifestUrl, {
        headers: { accept: "application/json", "cache-control": "no-cache" },
        cache: "no-store",
      });
      if (!manifestResponse?.ok) {
        throw new Error(`Production desktop manifest returned ${manifestResponse?.status || "an error"}.`);
      }
      const live = validateLiveManifest(await manifestResponse.json(), expected, releaseChannel);

      const updateUrl = new URL(
        `/api/desktop/update/${encodeURIComponent(releaseChannel)}/latest.yml`,
        origin,
      );
      updateUrl.searchParams.set("verify", nonce);
      const updateResponse = await fetchImpl(updateUrl, {
        headers: { "cache-control": "no-cache" },
        cache: "no-store",
        redirect: "manual",
      });
      redirectLocation(updateResponse, updateTarget, "latest.yml");

      if (releaseChannel === "stable") {
        const downloadUrl = new URL("/api/desktop/download", origin);
        downloadUrl.searchParams.set("verify", nonce);
        const downloadResponse = await fetchImpl(downloadUrl, {
          method: "HEAD",
          headers: { "cache-control": "no-cache" },
          cache: "no-store",
          redirect: "manual",
        });
        redirectLocation(downloadResponse, String(expected.downloadUrl), "installer");
      }

      return live;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= maxAttempts) break;
      await sleepImpl(waitMs);
    }
  }

  throw lastError || new Error("Production desktop release verification failed.");
}

async function main() {
  const manifestPath = path.resolve(
    process.env.HEYKASA_DESKTOP_RELEASE_MANIFEST || "release/release-manifest.json",
  );
  const envelope = JSON.parse(await readFile(manifestPath, "utf8"));
  const expected = envelope?.payload;
  const live = await verifyDesktopProductionRelease({
    baseUrl: process.env.HEYKASA_DESKTOP_PRODUCTION_URL || DEFAULT_BASE_URL,
    channel: process.env.HEYKASA_DESKTOP_RELEASE_CHANNEL || expected?.channel,
    expected,
    attempts: positiveInteger(process.env.HEYKASA_DESKTOP_VERIFY_ATTEMPTS, 24),
    delayMs: positiveInteger(process.env.HEYKASA_DESKTOP_VERIFY_DELAY_MS, 15_000),
  });
  console.log(JSON.stringify({
    event: "desktop_production_release_verified",
    channel: live.channel,
    version: live.latest,
    rolloutPercent: live.updateRolloutPercent,
  }));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath && import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
