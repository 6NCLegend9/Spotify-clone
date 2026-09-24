import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  desktopGithubReleaseDownloadUrl,
  desktopReleaseTag,
  normalizeDesktopReleaseChannel,
} from "../../src/utils/desktopRelease.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const distDir = path.join(desktopRoot, "dist");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
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

async function sha512File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha512");
    const input = fs.createReadStream(file);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("base64")));
  });
}

function writeGithubOutput(values) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/[\r\n]/g, "")}`);
  fs.appendFileSync(outputFile, `${lines.join("\n")}\n`, "utf8");
}

async function releaseFiles(version) {
  const names = await fsp.readdir(distDir);
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const installerPattern = new RegExp(`^HayKasa-Setup-${escapedVersion}-x64\\.exe$`, "i");
  const installer = names.find((name) => installerPattern.test(name));
  if (!installer) throw new Error(`Installer for ${version} was not found in desktop/dist.`);

  const blockmap = `${installer}.blockmap`;
  if (!names.includes(blockmap)) throw new Error(`Blockmap for ${installer} was not found in desktop/dist.`);

  const metadata = names.find((name) => /^(latest|beta|alpha|internal)\.ya?ml$/i.test(name));
  if (!metadata) throw new Error("electron-builder update metadata was not found in desktop/dist.");
  if (metadata !== "latest.yml") {
    await fsp.copyFile(path.join(distDir, metadata), path.join(distDir, "latest.yml"));
  }

  const latestText = await fsp.readFile(path.join(distDir, "latest.yml"), "utf8");
  if (!latestText.includes(version) || !latestText.includes(installer)) {
    throw new Error("latest.yml does not reference the stamped desktop version and installer.");
  }

  return { installer, blockmap };
}

const channel = normalizeDesktopReleaseChannel(process.env.HEYKASA_DESKTOP_RELEASE_CHANNEL);
if (!channel) throw new Error("HEYKASA_DESKTOP_RELEASE_CHANNEL must be stable, beta, or internal.");

const version = await packageVersion();
const minimum = cleanVersion(process.env.HEYKASA_DESKTOP_MINIMUM_VERSION || version, "minimum desktop version");
const releaseNotesUrl = cleanHttpsUrl(process.env.HEYKASA_DESKTOP_RELEASE_NOTES_URL);
const tag = desktopReleaseTag(channel, version);
if (!tag) throw new Error(`Could not create a GitHub Release tag for ${channel} ${version}.`);
if (channel === "stable" && version.includes("-")) throw new Error("Stable desktop releases cannot use prerelease versions.");

const files = await releaseFiles(version);
const installerPath = path.join(distDir, files.installer);
const installerStat = await fsp.stat(installerPath);
const installerSha512 = await sha512File(installerPath);
const installerUrl = desktopGithubReleaseDownloadUrl(tag, files.installer);
if (!installerUrl) throw new Error("Could not build the public GitHub installer URL.");

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
  updateRolloutPercent: 100,
  signed: channel !== "internal",
  source: "github-release",
};

let signature = "";
if (channel !== "internal") {
  const manifestSecret = required("HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET");
  if (manifestSecret.length < 32) {
    throw new Error("HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET must be at least 32 characters.");
  }
  signature = crypto
    .createHmac("sha256", manifestSecret)
    .update(JSON.stringify(payload), "utf8")
    .digest("base64url");
}

await fsp.writeFile(
  path.join(distDir, "release-manifest.json"),
  `${JSON.stringify({ payload, signature }, null, 2)}\n`,
  "utf8",
);

writeGithubOutput({
  version,
  channel,
  tag,
  installer: files.installer,
  blockmap: files.blockmap,
  installer_url: installerUrl,
  sha512: installerSha512,
});

console.log(JSON.stringify({
  event: "desktop_github_release_prepared",
  version,
  channel,
  tag,
  installer: files.installer,
  blockmap: files.blockmap,
  installerUrl,
  signed: payload.signed,
}));
