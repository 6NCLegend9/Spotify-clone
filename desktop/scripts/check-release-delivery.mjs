// Actual bundle CLI, trust verifier and manifest route with isolated files/HTTP.
// The installer bytes are a fixture; this does not prove Windows signing/install.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { desktopAppDownloadUrl, DESKTOP_INSTALLER_PUBLIC_NAME } from "../../src/utils/desktopInstaller.mjs";
import { desktopGithubReleaseDownloadUrl, isSafeDesktopReleaseFile, normalizeDesktopReleaseChannel, DESKTOP_RELEASES_API_URL } from "../../src/utils/desktopRelease.mjs";
import { fetchVerifiedDesktopGithubRelease, verifyDesktopReleaseEnvelope } from "../../src/utils/desktopReleaseTrust.mjs";
import { desktopRolloutPercent } from "../../src/utils/desktopRollout.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "haykasa-delivery-"));
const dist = path.join(directory, "desktop/dist");
const version = "1.2.3", installer = `HayKasa-Setup-${version}-x64.exe`;
const fixtureKey = "fixture-manifest-authentication-key-only";
const bytes = Buffer.from("Isolated QA bytes; not an executable or signed Windows installer.");
const hash = crypto.createHash("sha512").update(bytes).digest("base64");
const tag = `desktop-v${version}`;
const baseUrl = `https://github.com/6NCLegend9/Spotify-clone/releases/download/${tag}/`;
const metadata = `version: ${version}\nfiles:\n  - url: ${installer}\n    sha512: ${hash}\n    size: ${bytes.length}\npath: ${installer}\nsha512: ${hash}\n`;
let verifiedManifest;
try {
  for (const relative of [
    "desktop/scripts/prepare-github-release.mjs", "src/utils/desktopRelease.mjs",
    "src/utils/desktopReleaseTrust.mjs", "src/utils/desktopInstaller.mjs",
  ]) {
    const destination = path.join(directory, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(directory, "desktop/package.json"), JSON.stringify({ version, heykasaReleaseChannel: "stable" }));
  fs.writeFileSync(path.join(dist, installer), bytes);
  fs.writeFileSync(path.join(dist, `${installer}.blockmap`), "isolated fixture");
  fs.writeFileSync(path.join(dist, "latest.yml"), metadata);
  const prepare = () => spawnSync(process.execPath, [path.join(directory, "desktop/scripts/prepare-github-release.mjs")], {
    encoding: "utf8", env: { ...process.env,
      HEYKASA_DESKTOP_RELEASE_CHANNEL: "stable", HEYKASA_DESKTOP_MINIMUM_VERSION: "1.0.0",
      HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET: fixtureKey,
      HEYKASA_DESKTOP_RELEASE_NOTES_URL: "https://example.invalid/release-notes",
      GITHUB_OUTPUT: path.join(directory, "output"),
    },
  });
  const prepared = prepare();
  assert.equal(prepared.status, 0, prepared.stderr);
  assert(!prepared.stdout.includes(fixtureKey), "Bundle CLI never logs the manifest key");
  const envelope = JSON.parse(fs.readFileSync(path.join(dist, "release-manifest.json"), "utf8"));
  const assets = [installer, `${installer}.blockmap`, "latest.yml", "release-manifest.json"].map(name => ({ name }));
  let release = { draft: false, prerelease: false, tag_name: tag, assets };
  let servedEnvelope = envelope;
  const requests = [];
  const fetchImpl = async value => {
    const url = String(value); requests.push(url);
    if (url === DESKTOP_RELEASES_API_URL) return Response.json([release]);
    if (url === `${baseUrl}release-manifest.json`) return Response.json(servedEnvelope);
    if (url === `${baseUrl}latest.yml`) return new Response(metadata);
    throw new Error("Unexpected outbound request in isolated delivery fixture");
  };
  const trust = channel => fetchVerifiedDesktopGithubRelease(channel, { fetchImpl, manifestSecret: fixtureKey });
  const verified = await trust("stable");
  assert.equal(verified.payload.latest, version);
  assert.equal(verified.payload.sha512, hash);
  assert.equal(verified.payload.sizeBytes, bytes.length);

  const code = fs.readFileSync(path.join(root, "src/app/api/desktop/manifest/route.js"), "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\r?\n/gm, "")
    .replace(/^export /gm, "");
  const route = vm.createContext({
    Response, URL, console: { error() {} }, process: { env: {} },
    fetchManualDesktopDownload: async () => null, CURRENT_DESKTOP_API_VERSION: 1,
    desktopAppDownloadUrl, normalizeDesktopReleaseChannel, desktopRolloutPercent,
    fetchVerifiedDesktopGithubRelease: trust, verifyDesktopReleaseEnvelope,
  });
  vm.runInContext(`${code}\nglobalThis.getManifest = GET;`, route);
  const getManifest = async () => (await route.getManifest(new Request("https://example.invalid/api/desktop/manifest?channel=stable"))).json();
  verifiedManifest = await getManifest();
  assert.equal(verifiedManifest.latest, version);
  assert.equal(verifiedManifest.published, true, "A complete verified GitHub fixture becomes published naturally");
  assert.equal(verifiedManifest.signed, true, "Manifest retains its authenticated signed-release claim");
  assert.equal(verifiedManifest.downloadUrl, `${baseUrl}${installer}`);
  assert.equal(verifiedManifest.sha512, hash);

  const feedCode = fs.readFileSync(path.join(root, "src/app/api/desktop/update/[channel]/[file]/route.js"), "utf8")
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\r?\n/gm, "")
    .replace(/^export /gm, "");
  const feed = vm.createContext({
    Response, console: { error() {} }, DESKTOP_INSTALLER_PUBLIC_NAME,
    desktopGithubReleaseDownloadUrl, isSafeDesktopReleaseFile,
    normalizeDesktopReleaseChannel, fetchVerifiedDesktopGithubRelease: trust,
  });
  vm.runInContext(`${feedCode}\nglobalThis.getFeed = GET;`, feed);
  const getFeed = file => feed.getFeed(null, { params: Promise.resolve({ channel: "stable", file }) });
  for (const [file, target] of [["latest.yml", "latest.yml"], [installer, installer], [`${installer}.blockmap`, `${installer}.blockmap`], [DESKTOP_INSTALLER_PUBLIC_NAME, installer]]) {
    const response = await getFeed(file);
    assert.equal(response.status, 307, file);
    assert.equal(response.headers.get("location"), `${baseUrl}${target}`, `${file}: same verified version`);
  }
  assert.equal((await getFeed("../../other.exe")).status, 404);

  release = { ...release, assets: assets.filter(asset => asset.name !== "latest.yml") };
  assert.equal((await getManifest()).published, false, "An incomplete release is not advertised as installable");
  assert.equal((await getFeed("latest.yml")).status, 404);
  release = { ...release, assets };
  servedEnvelope = { ...envelope, signature: "x".repeat(43) };
  const rejected = await getManifest();
  assert.equal(rejected.published, false);
  assert.equal(rejected.signed, false, "An invalid manifest signature cannot become a signed release");
  assert.equal((await getFeed(installer)).status, 404, "Untrusted metadata cannot redirect to an installer");
  assert(requests.every(url => url === DESKTOP_RELEASES_API_URL || url.startsWith(baseUrl)));

  for (const test of [
    { name: "mismatched YAML version", text: metadata.replace(`version: ${version}`, "version: 99.0.0") },
    { name: "mismatched YAML installer", text: metadata.replace(`path: ${installer}`, "path: other.exe") },
    { name: "mismatched YAML hash", text: metadata.replaceAll(hash, "a".repeat(86) + "==") },
    { name: "mismatched YAML size", text: metadata.replace(`size: ${bytes.length}`, `size: ${bytes.length + 1}`) },
    { name: "empty installer", text: metadata.replaceAll(hash, crypto.createHash("sha512").update("").digest("base64")).replace(`size: ${bytes.length}`, "size: 0"), empty: true },
  ]) {
    fs.rmSync(path.join(dist, "release-manifest.json"), { force: true });
    fs.writeFileSync(path.join(dist, "latest.yml"), test.text);
    fs.writeFileSync(path.join(dist, installer), test.empty ? "" : bytes);
    const result = prepare();
    assert.notEqual(result.status, 0, `${test.name}: fail before publishing an unusable bundle`);
    assert.equal(fs.existsSync(path.join(dist, "release-manifest.json")), false, test.name);
    assert(!(result.stdout + result.stderr).includes(fixtureKey), test.name);
  }
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
export { verifiedManifest };
console.log("PASS: actual bundle CLI -> authenticated GitHub fixture -> actual manifest/feed routes; incomplete/tampered releases and inconsistent metadata rejected");
