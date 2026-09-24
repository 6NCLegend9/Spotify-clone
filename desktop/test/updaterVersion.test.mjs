import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { compareReleaseVersions, semanticVersionParts, versionOlderThan } from "../src/version.mjs";

test("desktop updater compares semantic versions for mandatory upgrades", () => {
  assert.deepEqual(semanticVersionParts("1.2.3"), [1, 2, 3]);
  assert.deepEqual(semanticVersionParts("2.0.0-beta.1"), [2, 0, 0]);
  assert.equal(semanticVersionParts("not-a-version"), null);

  assert.equal(versionOlderThan("1.0.0", "1.0.1"), true);
  assert.equal(versionOlderThan("1.9.9", "2.0.0"), true);
  assert.equal(versionOlderThan("2.0.0", "2.0.0"), false);
  assert.equal(versionOlderThan("2.1.0", "2.0.9"), false);
});


test("desktop updater source keeps downgrade and web-installer protections explicit", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/updater.mjs"), "utf8");
  assert.match(source, /autoUpdater\.disableWebInstaller\s*=\s*true/);
  const channelAssignment = source.indexOf('autoUpdater.channel = "latest"');
  const downgradeReset = source.indexOf("autoUpdater.allowDowngrade = false", channelAssignment);
  const feedAssignment = source.indexOf("autoUpdater.setFeedURL", channelAssignment);
  assert.ok(channelAssignment >= 0);
  assert.ok(downgradeReset > channelAssignment);
  assert.ok(feedAssignment > downgradeReset);
});


test("release version comparison respects prerelease ordering", () => {
  assert.equal(compareReleaseVersions("1.1.0", "1.0.9"), 1);
  assert.equal(compareReleaseVersions("1.1.0-beta.2", "1.1.0-beta.1"), 1);
  assert.equal(compareReleaseVersions("1.1.0", "1.1.0-beta.9"), 1);
  assert.equal(compareReleaseVersions("1.1.0", "1.1.0"), 0);
  assert.equal(compareReleaseVersions("1.0.9", "1.1.0"), -1);
  assert.equal(compareReleaseVersions("bad", "1.1.0"), null);
});


test("stable and beta updater paths require a signed manifest before auto-update", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/updater.mjs"), "utf8");
  assert.match(source, /this\.channel\(\) !== "internal" && manifest\.signed !== true/);
  assert.match(source, /will not be installed automatically/);
});
