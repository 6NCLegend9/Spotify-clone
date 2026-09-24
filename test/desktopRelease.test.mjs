import assert from "node:assert/strict";
import test from "node:test";
import {
  DESKTOP_RELEASES_API_URL,
  desktopGithubReleaseDownloadUrl,
  desktopReleaseBundle,
  desktopReleaseTag,
  desktopReleaseVersionFromTag,
  fetchDesktopGithubRelease,
  isSafeDesktopReleaseFile,
  normalizeDesktopReleaseChannel,
  selectDesktopGithubRelease,
} from "../src/utils/desktopRelease.mjs";

function release(channel, version, overrides = {}) {
  const tag = desktopReleaseTag(channel, version);
  const installer = `HayKasa-Setup-${version}-x64.exe`;
  return {
    draft: false,
    prerelease: channel !== "stable",
    tag_name: tag,
    published_at: "2026-09-23T12:00:00Z",
    assets: [
      { name: "latest.yml" },
      { name: "release-manifest.json" },
      { name: installer },
      { name: `${installer}.blockmap` },
    ],
    ...overrides,
  };
}

test("desktop release channels map to immutable GitHub Release tags", () => {
  assert.equal(normalizeDesktopReleaseChannel("stable"), "stable");
  assert.equal(normalizeDesktopReleaseChannel("BETA"), "beta");
  assert.equal(normalizeDesktopReleaseChannel("unknown"), "");

  assert.equal(desktopReleaseTag("stable", "1.2.3"), "desktop-v1.2.3");
  assert.equal(desktopReleaseTag("beta", "1.2.3-beta.1"), "desktop-beta-v1.2.3-beta.1");
  assert.equal(desktopReleaseTag("internal", "1.2.3-internal.7"), "desktop-internal-v1.2.3-internal.7");
  assert.equal(desktopReleaseTag("stable", "1.2.3-beta.1"), "");
  assert.equal(desktopReleaseVersionFromTag("desktop-v1.2.3", "stable"), "1.2.3");
});

test("GitHub release asset URLs are constrained to the HayKasa repository and safe filenames", () => {
  assert.equal(
    desktopGithubReleaseDownloadUrl("desktop-v1.2.3", "latest.yml"),
    "https://github.com/6NCLegend9/Spotify-clone/releases/download/desktop-v1.2.3/latest.yml",
  );
  assert.equal(isSafeDesktopReleaseFile("HayKasa-Setup-1.2.3-x64.exe.blockmap"), true);
  assert.equal(isSafeDesktopReleaseFile("../latest.yml"), false);
  assert.equal(desktopGithubReleaseDownloadUrl("desktop-v1.2.3", "../latest.yml"), "");
  assert.equal(desktopGithubReleaseDownloadUrl("https://evil.example", "latest.yml"), "");
});

test("release selection separates stable, beta, and internal channels", () => {
  const stable = release("stable", "1.2.3");
  const beta = release("beta", "1.3.0-beta.2");
  const internal = release("internal", "1.4.0-internal.9");
  const unrelated = { ...release("stable", "9.9.9"), tag_name: "website-v9.9.9" };
  const releases = [unrelated, internal, beta, stable];

  assert.equal(selectDesktopGithubRelease(releases, "stable"), stable);
  assert.equal(selectDesktopGithubRelease(releases, "beta"), beta);
  assert.equal(selectDesktopGithubRelease(releases, "internal"), internal);
  assert.equal(selectDesktopGithubRelease([{ ...stable, draft: true }], "stable"), null);
});

test("a desktop release is publishable only when the complete updater bundle exists", () => {
  const stable = release("stable", "1.2.3");
  const bundle = desktopReleaseBundle(stable, "stable");
  assert.equal(bundle.version, "1.2.3");
  assert.equal(bundle.installerFile, "HayKasa-Setup-1.2.3-x64.exe");
  assert.equal(bundle.blockmapFile, "HayKasa-Setup-1.2.3-x64.exe.blockmap");
  assert.equal(bundle.metadataFile, "latest.yml");
  assert.equal(bundle.manifestFile, "release-manifest.json");
  assert.equal(bundle.installerUrl, "https://github.com/6NCLegend9/Spotify-clone/releases/download/desktop-v1.2.3/HayKasa-Setup-1.2.3-x64.exe");

  assert.equal(desktopReleaseBundle({ ...stable, assets: stable.assets.filter((asset) => asset.name !== "latest.yml") }, "stable"), null);
  assert.equal(desktopReleaseBundle({ ...stable, assets: stable.assets.filter((asset) => !asset.name.endsWith(".blockmap")) }, "stable"), null);
  assert.equal(desktopReleaseBundle({ ...stable, tag_name: "desktop-v1.2.4" }, "stable"), null);
});

test("GitHub release lookup uses the public releases API and returns the requested channel", async () => {
  let request;
  const stable = release("stable", "2.0.0");
  const selected = await fetchDesktopGithubRelease("stable", async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify([release("beta", "2.1.0-beta.1"), stable]), { status: 200 });
  });
  assert.equal(request.url, DESKTOP_RELEASES_API_URL);
  assert.equal(request.options.headers.accept, "application/vnd.github+json");
  assert.equal(selected.tag_name, "desktop-v2.0.0");
});
