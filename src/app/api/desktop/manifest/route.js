import crypto from "node:crypto";
import {
  desktopReleaseFileUrl,
  normalizeDesktopReleaseChannel,
} from "../../../../utils/desktopRelease.mjs";

export const runtime = "nodejs";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

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

function version(value, fallback = "0.1.0") {
  const text = typeof value === "string" ? value.trim() : "";
  return SEMVER.test(text) ? text : fallback;
}

function normalizeManifest(input = {}, requestedChannel = "stable") {
  const channel = normalizeDesktopReleaseChannel(requestedChannel) || "stable";
  const isStable = channel === "stable";
  const latest = version(
    input.latest || input.version || (isStable ? process.env.HEYKASA_DESKTOP_LATEST_VERSION : ""),
    "0.1.0",
  );
  const minimum = version(
    input.minimum || (isStable ? process.env.HEYKASA_DESKTOP_MINIMUM_VERSION : ""),
    "0.1.0",
  );
  const downloadUrl = httpsUrl(
    input.downloadUrl || (isStable ? process.env.HEYKASA_DESKTOP_DOWNLOAD_URL : ""),
  );
  const releaseNotesUrl = httpsUrl(
    input.releaseNotesUrl || (isStable ? process.env.HEYKASA_DESKTOP_RELEASE_NOTES_URL : ""),
  );

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

async function loadManifest(channel) {
  const manifestUrl = configuredManifestUrl(channel);
  if (!manifestUrl) return normalizeManifest({}, channel);

  try {
    const response = await fetch(manifestUrl, {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`Desktop manifest returned ${response.status}.`);
    const envelope = await response.json();
    const payload = verifiedRemotePayload(envelope);
    if ((normalizeDesktopReleaseChannel(payload?.channel) || "stable") !== channel) {
      throw new Error("Desktop manifest channel does not match the requested channel.");
    }
    return normalizeManifest(payload, channel);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      msg: "desktop_manifest_fetch_failed",
      channel,
      error: error instanceof Error ? error.message : String(error),
    }));
    // Fail closed to server-owned fallback configuration. Non-stable channels
    // never inherit the stable download URL when their signed manifest is absent.
    return normalizeManifest({}, channel);
  }
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
