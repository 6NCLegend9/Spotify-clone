import crypto from "node:crypto";
import {
  DESKTOP_INSTALLER_APP_PATH,
  DESKTOP_INSTALLER_NOTES_URL,
  desktopAppDownloadUrl,
  findLocalDesktopInstaller,
} from "../../../../utils/desktopInstaller.mjs";
import {
  desktopGithubReleaseDownloadUrl,
  desktopReleaseBundle,
  fetchDesktopGithubRelease,
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
    signed: input.signed === true,
    source: typeof input.source === "string" ? input.source.slice(0, 40) : (downloadUrl ? "configured" : "none"),
    portable: input.portable === true,
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
  const payload = verifiedRemotePayload(envelope);
  if ((normalizeDesktopReleaseChannel(payload?.channel) || "stable") !== expectedChannel) {
    throw new Error("Desktop manifest channel does not match the expected channel.");
  }
  return payload;
}

async function githubReleaseManifest(channel) {
  const release = await fetchDesktopGithubRelease(channel);
  const bundle = desktopReleaseBundle(release, channel);
  if (!bundle) {
    if (!release) return null;
    throw new Error("The selected GitHub desktop release is missing required updater assets.");
  }

  const manifestUrl = desktopGithubReleaseDownloadUrl(bundle.tag, bundle.manifestFile);
  const response = await fetch(manifestUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub desktop manifest returned ${response.status}.`);
  const envelope = await response.json();
  const payload = channel === "internal"
    ? envelope?.payload
    : verifiedRemotePayload(envelope);

  if (!payload || typeof payload !== "object") throw new Error("GitHub desktop manifest payload is invalid.");
  if (normalizeDesktopReleaseChannel(payload.channel) !== channel) {
    throw new Error("GitHub desktop manifest channel mismatch.");
  }
  if (String(payload.latest || "").trim() !== bundle.version) {
    throw new Error("GitHub desktop manifest version does not match the release assets.");
  }
  if (desktopAppDownloadUrl(payload.downloadUrl) !== bundle.installerUrl) {
    throw new Error("GitHub desktop manifest installer URL does not match the release bundle.");
  }
  if (!sha512(payload.sha512)) throw new Error("GitHub desktop manifest is missing a valid installer SHA-512.");
  if (!Number.isSafeInteger(payload.sizeBytes) || payload.sizeBytes <= 0) {
    throw new Error("GitHub desktop manifest is missing a valid installer size.");
  }
  if (channel === "internal" && payload.signed === true) {
    throw new Error("Internal desktop previews must not claim to be signed releases.");
  }
  if (channel !== "internal" && payload.signed !== true) {
    throw new Error("Stable and beta desktop releases must be signed.");
  }

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

  if (configured.published || channel !== "stable") return configured;

  const localInstaller = findLocalDesktopInstaller();
  if (!localInstaller) return configured;

  return normalizeManifest({
    latest: configured.latest,
    minimum: configured.minimum,
    recommended: configured.recommended,
    downloadUrl: DESKTOP_INSTALLER_APP_PATH,
    releaseNotesUrl: DESKTOP_INSTALLER_NOTES_URL,
    sizeBytes: localInstaller.sizeBytes,
    signed: false,
    portable: false,
    source: "local-installer",
  }, channel);
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
