import assert from "node:assert/strict";
import test from "node:test";
import {
  desktopGithubReleaseFileUrl,
  desktopGithubReleasePageUrl,
  desktopGithubReleaseTag,
  desktopReleaseFileUrl,
} from "../src/utils/desktopRelease.mjs";

test("desktop GitHub fallback maps stable and internal channels to fixed release tags", () => {
  assert.equal(desktopGithubReleaseTag("stable"), "desktop-latest");
  assert.equal(desktopGithubReleaseTag("internal"), "desktop-preview");
  assert.equal(desktopGithubReleaseTag("beta"), "");
  assert.equal(
    desktopGithubReleaseFileUrl("stable", "latest.yml"),
    "https://github.com/6NCLegend9/Spotify-clone/releases/download/desktop-latest/latest.yml",
  );
  assert.equal(
    desktopGithubReleaseFileUrl("internal", "release-manifest.json"),
    "https://github.com/6NCLegend9/Spotify-clone/releases/download/desktop-preview/release-manifest.json",
  );
  assert.equal(
    desktopGithubReleasePageUrl("stable"),
    "https://github.com/6NCLegend9/Spotify-clone/releases/tag/desktop-latest",
  );
});

test("desktop release URLs reject unsupported channels and unsafe filenames", () => {
  assert.equal(desktopGithubReleaseFileUrl("stable", "../latest.yml"), "");
  assert.equal(desktopGithubReleaseFileUrl("beta", "latest.yml"), "");
  assert.equal(desktopGithubReleaseFileUrl("unknown", "latest.yml"), "");
  assert.equal(
    desktopReleaseFileUrl("https://not-blob.example.com", "stable", "latest.yml"),
    "",
  );
});
