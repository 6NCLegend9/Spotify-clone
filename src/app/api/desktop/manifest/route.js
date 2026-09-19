import crypto from "node:crypto";
import {
  desktopReleaseFileUrl,
  normalizeDesktopReleaseChannel,
} from "../../../../utils/desktopRelease.mjs";

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
  const downloadUrl = httpsUrl(
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
      : 1,
    channel,
    platform: "win32",
    arch: "x64",
    downloadUrl,
    releaseNotesUrl,
    publishedAt: typeof input.publishedAt === "string" ? input.publishedAt.slice(0, 40) : "",
    sizeBytes: Number.isSafeInteger(input.sizeBytes) && input.sizeBytes > 0 ? input.sizeBytes : null,
    sha512: installerSha512,
    updateRolloutPercent,
    signed: input.signed !== false,
    source: typeof input.source === "string" ? input.source.slice(0, 40) : (downloadUrl ? "stable" : "none"),
    published: Boolean(downloadUrl),
  };
}

function verifiedRemotePayload(envelope) {
  const secret = String(process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET || "");
  if (secret.length < 32) throw new Error("Desktop manifest verification is not configured.");
  if (!envelope || typeof envelope !== "object" || !envelope.payload || typeof envelope.payload !== "object") {
    throw new Error("Desktop manifest envelope is invalid.");
  }
  const signature = typeof envelope.signature === "string" ? envelope.signature.trim() : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) throw new Error("Desktop manifest signature is invalid.");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(envelope.payload), "utf8")
    .digest("base64url");
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(signature, "utf8");
  if (expectedBytes.length !== receivedBytes.length
    || !crypto.timingSafeEqual(expectedBytes, receivedBytes)) {
    throw new Error("Desktop manifest signature verification failed.");
  }
  return envelope.payload;
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
  if (channel === "stable") {
    const explicit = httpsUrl(process.env.HEYKASA_DESKTOP_MANIFEST_URL);
    if (explicit) return explicit;
  }
  return desktopReleaseFileUrl(
    process.env.HEYKASA_DESKTOP_BLOB_BASE_URL,
    channel,
    "release-manifest.json",
  );
}

async function fetchVerifiedManifest(manifestUrl, expectedChannel) {
  if (!manifestUrl) return null;
  const response = await fetch(manifestUrl, {
    headers: { accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Desktop manifest returned ${response.status}.`);
  const envelope = await response.json();
  const payload = verifiedRemotePayload(envelope);
  if ((normalizeDesktopReleaseChannel(payload?.channel) || "stable") !== expectedChannel) {
    throw new Error("Desktop manifest channel does not match the expected channel.");
  }
  return payload;
}

async function loadInternalPreview() {
  const previewUrl = configuredManifestUrl("internal");
  if (!previewUrl) return null;
  try {
    const payload = await fetchVerifiedManifest(previewUrl, "internal");
    return normalizeManifest({
      ...payload,
      signed: false,
      source: "internal-preview",
    }, "stable");
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      msg: "desktop_preview_manifest_fetch_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

async function loadManifest(channel) {
  const configured = normalizeManifest({}, channel);
  const manifestUrl = configuredManifestUrl(channel);

  if (manifestUrl) {
    try {
      const payload = await fetchVerifiedManifest(manifestUrl, channel);
      return normalizeManifest(payload, channel);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        msg: "desktop_manifest_fetch_failed",
        channel,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (configured.published || channel !== "stable") return configured;
  return (await loadInternalPreview()) || configured;
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
