import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const distDir = path.join(desktopRoot, "dist");
const CHANNELS = new Set(["stable", "beta", "internal"]);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function cleanChannel(value) {
  const channel = String(value || "stable").trim().toLowerCase();
  if (!CHANNELS.has(channel)) throw new Error(`Unsupported release channel: ${channel}`);
  return channel;
}

function cleanVersion(value, label) {
  const version = String(value || "").trim();
  if (!SEMVER.test(version)) throw new Error(`${label} must be a semantic version.`);
  return version;
}

function cleanHttpsUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const url = new URL(text);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Release notes URL must be HTTPS without embedded credentials.");
  }
  return url.href;
}

async function packageVersion() {
  const pkg = JSON.parse(await fsp.readFile(path.join(desktopRoot, "package.json"), "utf8"));
  return cleanVersion(pkg.version, "desktop/package.json version");
}

async function releaseFiles(version) {
  const names = await fsp.readdir(distDir);
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const installerPattern = new RegExp(`^HeyKasa-Setup-${escapedVersion}-x64\\.exe$`, "i");
  const installer = names.find((name) => installerPattern.test(name));
  if (!installer) throw new Error(`Signed installer for ${version} was not found in desktop/dist.`);

  const updateMetadata = names.find((name) => /^(latest|beta|alpha|internal)\.ya?ml$/i.test(name));
  if (!updateMetadata) throw new Error("electron-builder update metadata was not found in desktop/dist.");

  const blockmaps = names.filter((name) => name.toLowerCase().endsWith(".blockmap"));
  return { installer, updateMetadata, blockmaps };
}

async function sha512File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha512");
    const input = fs.createReadStream(file);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("base64")));
  });
}

async function uploadFile(localName, remoteName, { overwrite = false, immutable = false } = {}) {
  const file = path.join(distDir, localName);
  return put(remoteName, fs.createReadStream(file), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    cacheControlMaxAge: immutable ? 31_536_000 : 60,
    token: required("BLOB_READ_WRITE_TOKEN"),
  });
}

async function verifyPublishedFile(url, expectedSize = null) {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" });
  if (!response.ok) throw new Error(`Published desktop artifact returned ${response.status}: ${url}`);
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(expectedSize) && expectedSize > 0 && Number.isFinite(contentLength) && contentLength > 0
    && contentLength !== expectedSize) {
    throw new Error(`Published desktop artifact size mismatch: ${url}`);
  }
}

function deriveBlobBaseUrl(uploadUrl, channel, filename) {
  const url = new URL(uploadUrl);
  const suffix = `/${encodeURIComponent(channel)}/${encodeURIComponent(filename)}`;
  const decodedSuffix = `/${channel}/${filename}`;
  if (url.pathname.endsWith(suffix)) url.pathname = url.pathname.slice(0, -suffix.length);
  else if (url.pathname.endsWith(decodedSuffix)) url.pathname = url.pathname.slice(0, -decodedSuffix.length);
  else throw new Error("Could not derive the HeyKasa desktop Blob base URL from the uploaded installer.");
  return url.href.replace(/\/$/, "");
}

function writeGithubOutput(values) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/[\r\n]/g, "")}`);
  fs.appendFileSync(outputFile, `${lines.join("\n")}\n`, "utf8");
}

const channel = cleanChannel(process.env.HEYKASA_DESKTOP_RELEASE_CHANNEL);
const version = await packageVersion();
const minimum = cleanVersion(process.env.HEYKASA_DESKTOP_MINIMUM_VERSION || version, "minimum desktop version");
const releaseNotesUrl = cleanHttpsUrl(process.env.HEYKASA_DESKTOP_RELEASE_NOTES_URL);
const manifestSecret = required("HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET");
if (manifestSecret.length < 32) throw new Error("HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET must be at least 32 characters.");

const files = await releaseFiles(version);
const remotePrefix = `desktop/${channel}`;
const installerPath = path.join(distDir, files.installer);
const installerStat = await fsp.stat(installerPath);
const installerSha512 = await sha512File(installerPath);
const installerUpload = await uploadFile(
  files.installer,
  `${remotePrefix}/${files.installer}`,
  { immutable: true },
);
const installerUrl = installerUpload.downloadUrl || installerUpload.url;
await verifyPublishedFile(installerUrl, installerStat.size);

for (const blockmap of files.blockmaps) {
  const blockmapPath = path.join(distDir, blockmap);
  const blockmapStat = await fsp.stat(blockmapPath);
  const result = await uploadFile(blockmap, `${remotePrefix}/${blockmap}`, { immutable: true });
  await verifyPublishedFile(result.downloadUrl || result.url, blockmapStat.size);
}

const payload = {
  latest: version,
  minimum,
  recommended: version,
  desktopApiVersion: 1,
  channel,
  platform: "win32",
  arch: "x64",
  downloadUrl: installerUrl,
  releaseNotesUrl,
  publishedAt: new Date().toISOString(),
  sizeBytes: installerStat.size,
  sha512: installerSha512,
};
const signature = crypto
  .createHmac("sha256", manifestSecret)
  .update(JSON.stringify(payload), "utf8")
  .digest("base64url");
const envelope = `${JSON.stringify({ payload, signature }, null, 2)}\n`;
const manifestUpload = await put(`${remotePrefix}/release-manifest.json`, envelope, {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: 60,
  contentType: "application/json; charset=utf-8",
  token: required("BLOB_READ_WRITE_TOKEN"),
});
await verifyPublishedFile(manifestUpload.downloadUrl || manifestUpload.url);

// This normalized metadata file is the final publication switch for every
// channel. DesktopUpdater deliberately asks electron-updater for `latest.yml`
// inside the selected channel directory.
const metadataUpload = await uploadFile(files.updateMetadata, `${remotePrefix}/latest.yml`, { overwrite: true });
await verifyPublishedFile(metadataUpload.downloadUrl || metadataUpload.url);

const blobBaseUrl = deriveBlobBaseUrl(installerUpload.url, channel, files.installer);
writeGithubOutput({
  version,
  channel,
  installer_url: installerUrl,
  blob_base_url: blobBaseUrl,
  sha512: installerSha512,
});

console.log(JSON.stringify({
  event: "desktop_release_published",
  version,
  channel,
  installerUrl,
  blobBaseUrl,
  sha512: installerSha512,
}));
