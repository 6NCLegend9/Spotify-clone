import crypto from "node:crypto";
import { desktopAppDownloadUrl } from "./desktopInstaller.mjs";
import {
  desktopGithubReleaseDownloadUrl,
  desktopReleaseBundle,
  fetchDesktopGithubRelease,
  normalizeDesktopReleaseChannel,
} from "./desktopRelease.mjs";

const SHA512_BASE64 = /^[A-Za-z0-9+/]{86}==$/;

export function verifyDesktopReleaseEnvelope(envelope, secretValue) {
  const secret = String(secretValue || "");
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

export async function fetchVerifiedDesktopGithubRelease(channelValue, {
  fetchImpl = globalThis.fetch,
  manifestSecret = process.env.HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET,
} = {}) {
  const channel = normalizeDesktopReleaseChannel(channelValue);
  if (!channel) return null;

  const release = await fetchDesktopGithubRelease(channel, fetchImpl);
  const bundle = desktopReleaseBundle(release, channel);
  if (!bundle) {
    if (!release) return null;
    throw new Error("The selected GitHub desktop release is missing required updater assets.");
  }

  const manifestUrl = desktopGithubReleaseDownloadUrl(bundle.tag, bundle.manifestFile);
  const response = await fetchImpl(manifestUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response?.ok) throw new Error(`GitHub desktop manifest returned ${response?.status || "an error"}.`);

  const envelope = await response.json();
  const payload = channel === "internal"
    ? envelope?.payload
    : verifyDesktopReleaseEnvelope(envelope, manifestSecret);

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

  const installerSha512 = typeof payload.sha512 === "string" ? payload.sha512.trim() : "";
  if (!SHA512_BASE64.test(installerSha512)) {
    throw new Error("GitHub desktop manifest is missing a valid installer SHA-512.");
  }
  if (!Number.isSafeInteger(payload.sizeBytes) || payload.sizeBytes <= 0) {
    throw new Error("GitHub desktop manifest is missing a valid installer size.");
  }
  if (channel === "internal" && payload.signed === true) {
    throw new Error("Internal desktop previews must not claim to be signed releases.");
  }
  if (channel !== "internal" && payload.signed !== true) {
    throw new Error("Stable and beta desktop releases must be signed.");
  }

  return { release, bundle, payload };
}
