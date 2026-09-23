import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const distDir = path.join(desktopRoot, "dist");
const CHANNELS = new Set(["stable", "beta", "internal"]);
const TAGS = Object.freeze({ stable: "desktop-latest", internal: "desktop-preview", beta: "desktop-beta" });
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function cleanChannel(value) {
  const channel = String(value || "stable").trim().toLowerCase();
  if (!CHANNELS.has(channel)) throw new Error("Unsupported desktop release channel: " + channel);
  return channel;
}

function cleanVersion(value, label) {
  const version = String(value || "").trim();
  if (!SEMVER.test(version)) throw new Error(label + " must be a semantic version.");
  return version;
}

async function packageVersion() {
  const pkg = JSON.parse(await fsp.readFile(path.join(desktopRoot, "package.json"), "utf8"));
  return cleanVersion(pkg.version, "desktop/package.json version");
}

async function sha512File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha512");
    const input = fs.createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("base64")));
  });
}

function writeGithubOutput(values) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  const rows = Object.entries(values).map(([key, value]) => key + "=" + String(value).replace(/[\r\n]/g, ""));
  fs.appendFileSync(outputFile, rows.join("\n") + "\n", "utf8");
}

const channel = cleanChannel(process.env.HEYKASA_DESKTOP_RELEASE_CHANNEL);
const version = await packageVersion();
const minimum = cleanVersion(process.env.HEYKASA_DESKTOP_MINIMUM_VERSION || "1.0.0", "minimum desktop version");
const tag = TAGS[channel];
const names = await fsp.readdir(distDir);
const escapedVersion = version.replace(/\./g, "\\.");
const installerPattern = new RegExp("^HayKasa-Setup-" + escapedVersion + "-x64\\.exe$", "i");
const installer = names.find((name) => installerPattern.test(name));
if (!installer) throw new Error("Installer for " + version + " was not found in desktop/dist.");

const metadata = names.find((name) => /^(latest|beta|alpha|internal)\.ya?ml$/i.test(name));
if (!metadata) throw new Error("electron-builder update metadata was not found in desktop/dist.");

const installerPath = path.join(distDir, installer);
const stat = await fsp.stat(installerPath);
const sha512 = await sha512File(installerPath);
await fsp.copyFile(installerPath, path.join(distDir, "HayKasa-Setup-x64.exe"));
if (metadata.toLowerCase() !== "latest.yml") {
  await fsp.copyFile(path.join(distDir, metadata), path.join(distDir, "latest.yml"));
}

const manifest = {
  formatVersion: 1,
  latest: version,
  minimum,
  recommended: version,
  desktopApiVersion: 1,
  channel,
  platform: "win32",
  arch: "x64",
  publishedAt: new Date().toISOString(),
  sizeBytes: stat.size,
  sha512,
  signed: false,
  source: "github-release",
};
await fsp.writeFile(
  path.join(distDir, "release-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);

writeGithubOutput({ version, channel, tag, installer, sha512 });
console.log(JSON.stringify({
  event: "desktop_github_release_prepared",
  version,
  channel,
  tag,
  installer,
  sizeBytes: stat.size,
  sha512,
}));
