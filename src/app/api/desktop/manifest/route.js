import { CURRENT_DESKTOP_API_VERSION } from "../../../../generated/desktopContract.mjs";
import {
  desktopAppDownloadUrl,
} from "../../../../utils/desktopInstaller.mjs";
import {
  normalizeDesktopReleaseChannel,
} from "../../../../utils/desktopRelease.mjs";
import {
  fetchVerifiedDesktopGithubRelease,
  verifyDesktopReleaseEnvelope,
} from "../../../../utils/desktopReleaseTrust.mjs";

export const runtime = "nodejs";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA512_BASE64 = /^[A-Za-z0-9+/]{86}==$/;

function httpsUrl(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function version(value, fallback = "1.0.0") {
  const text = typeof value === "string" ? value.trim() : "";
  return SEMVER.test(text) ? text : fallback;
}

function sha512(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return SHA512_BASE64.test(text) ? text : "";
}

function percentage(value, fallback = 100) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const number = Number(text);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
}

function normalizeManifest(input = {}, requestedChannel = "stable") {
  const channel = normalizeDesktopReleaseChannel(requestedChannel) || "stable";
  const isStable = channel === "stable";
  const latest = version(
    input.latest || input.version || (isStable ? process.env.HEYKASA_DESKTOP_LATEST_VERSION : ""),
    "1.0.0",
  );
  const minimum = version(
    input.minimum || (isStable ? process.env.HEYKASA_DESKTOP_MINIMUM_VERSION : ""),
    "1.0.0",
  );
  const downloadUrl = desktopAppDownloadUrl(
    input.downloadUrl || (isStable ? process.env.HEYKASA_DESKTOP_DOWNLOAD_URL : ""),
  );
  const releaseNotesUrl = httpsUrl(
    input.releaseNotesUrl || (isStable ? process.env.HEYKASA_DESKTOP_RELEASE_NOTES_URL : ""),
  );
  const installerSha512 = sha512(
    input.sha512 || (isStable ? process.env.HEYKASA_DESKTOP_SHA512 : ""),
  );
  const rolloutEnv = isStable ? String(process.env.HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT ?? "").trim() : "";
  const updateRolloutPercent = rolloutEnv
    ? percentage(rolloutEnv, 100)
    : percentage(input.updateRolloutPercent, 100);

  return {
    formatVersion: 1,
    latest,
    minimum,
    recommended: version(input.recommended, latest),
    desktopApiVersion: Number.isInteger(input.desktopApiVersion) && input.desktopApiVersion > 0
      ? input.desktopApiVersion
      : CURRENT_DESKTOP_API_VERSION,
    channel,
    platform: "win32",
    arch: "x64",
    downloadUrl,
    releaseNotesUrl,
    publishedAt: typeof input.publishedAt === "string" ? input.publishedAt.slice(0, 40) : "",
    sizeBytes: Number.isSafeInteger(input.sizeBytes) && input.sizeBytes > 0 ? input.sizeBytes : null,
    sha512: installerSha512,
    updateRolloutPercent,
    signed: input.signed === true,
    source: typeof input.source === "string" ? input.source.slice(0, 40) : (downloadUrl ? "configured" : "none"),
    portable: input.portable === true,
    published: Boolean(downloadUrl),
  };
}

function requestedChannel(request) {
  if (!request?.url) return "stable";
  try {
    return normalizeDesktopReleaseChannel(new URL(request.url).searchParams.get("channel")) || "stable";
  } catch {
    return "stable";
  }
}

function configuredManifestUrl(channel) {
  if (channel !== "stable") return "";
  return httpsUrl(process.env.HEYKASA_DESKTOP_MANIFEST_URL);
}

async function fetchVerifiedManifest(manifestUrl, expectedChannel) {
  if (!manifestUrl) return null;
  const response = await fetch(manifestUrl, {
    headers: { accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Desktop manifest returned ${response.status}.`);
  const envelope = await response.json();
  const payload = verifyDesktopReleaseEnvelope(
    envelope,
    process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET,
  );
  if ((normalizeDesktopReleaseChannel(payload?.channel) || "stable") !== expectedChannel) {
    throw new Error("Desktop manifest channel does not match the expected channel.");
  }
  return payload;
}

async function githubReleaseManifest(channel) {
  const verified = await fetchVerifiedDesktopGithubRelease(channel);
  if (!verified) return null;

  const { bundle, payload } = verified;
  return normalizeManifest({
    ...payload,
    downloadUrl: bundle.installerUrl,
    source: "github-release",
    signed: channel !== "internal",
  }, channel);
}

async function loadManifest(channel) {
  const configured = normalizeManifest({}, channel);
  const manifestUrl = configuredManifestUrl(channel);

  if (manifestUrl) {
    try {
      const payload = await fetchVerifiedManifest(manifestUrl, channel);
      return normalizeManifest({
        ...payload,
        signed: true,
        source: "configured-signed-manifest",
      }, channel);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        msg: "desktop_manifest_override_fetch_failed",
        channel,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  try {
    const release = await githubReleaseManifest(channel);
    if (release) return release;
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      msg: "desktop_github_release_fetch_failed",
      channel,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  if (channel === "stable") {
    return {
      ...configured,
      downloadUrl: "",
      releaseNotesUrl: "",
      sizeBytes: null,
      sha512: "",
      signed: false,
      source: "none",
      portable: false,
      published: false,
    };
  }

  return configured;
}

export async function GET(request) {
  const channel = requestedChannel(request);
  const manifest = await loadManifest(channel);
  return Response.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
