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
  const installerPattern = new RegExp(`^HeyKasa-Setup-${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-x64\\.exe$`, "i");
  const installer = names.find((name) => installerPattern.test(name));
  if (!installer) throw new Error(`Signed installer for ${version} was not found in desktop/dist.`);

  const updateMetadata = names.find((name) => /^(latest|beta|alpha|internal)\.ya?ml$/i.test(name));
  if (!updateMetadata) throw new Error("electron-builder update metadata was not found in desktop/dist.");

  const blockmaps = names.filter((name) => name.toLowerCase().endsWith(".blockmap"));
  return { installer, updateMetadata, blockmaps };
}

async function uploadFile(localName, remoteName, { overwrite = false, immutable = false } = {}) {
  const file = path.join(distDir, localName);
  const result = await put(remoteName, fs.createReadStream(file), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    cacheControlMaxAge: immutable ? 31_536_000 : 60,
    token: required("BLOB_READ_WRITE_TOKEN"),
  });
  return result;
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
const installerUpload = await uploadFile(
  files.installer,
  `${remotePrefix}/${files.installer}`,
  { immutable: true },
);

for (const blockmap of files.blockmaps) {
  await uploadFile(blockmap, `${remotePrefix}/${blockmap}`, { immutable: true });
}

const installerStat = await fsp.stat(path.join(distDir, files.installer));
const payload = {
  latest: version,
  minimum,
  recommended: version,
  desktopApiVersion: 1,
  channel,
  platform: "win32",
  arch: "x64",
  downloadUrl: installerUpload.downloadUrl || installerUpload.url,
  releaseNotesUrl,
  publishedAt: new Date().toISOString(),
  sizeBytes: installerStat.size,
};
const signature = crypto
  .createHmac("sha256", manifestSecret)
  .update(JSON.stringify(payload), "utf8")
  .digest("base64url");
const envelope = `${JSON.stringify({ payload, signature }, null, 2)}\n`;
await put(`${remotePrefix}/release-manifest.json`, envelope, {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: 60,
  contentType: "application/json; charset=utf-8",
  token: required("BLOB_READ_WRITE_TOKEN"),
});

// The updater metadata is the final publication switch. All referenced binary
// files and the signed website manifest already exist before latest.yml moves.
await uploadFile(files.updateMetadata, `${remotePrefix}/latest.yml`, { overwrite: true });

const blobBaseUrl = deriveBlobBaseUrl(installerUpload.url, channel, files.installer);
writeGithubOutput({
  version,
  channel,
  installer_url: installerUpload.downloadUrl || installerUpload.url,
  blob_base_url: blobBaseUrl,
});

console.log(JSON.stringify({
  event: "desktop_release_published",
  version,
  channel,
  installerUrl: installerUpload.downloadUrl || installerUpload.url,
  blobBaseUrl,
}));
