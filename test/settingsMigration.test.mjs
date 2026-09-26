import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { migrateLegacySettings } from "../src/utils/settingsMigration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("migrates legacy video audio-only sentinel into the supported audioOnly setting", () => {
  const source = {
    videoQuality: "audio-only",
    streamingQuality: "very-high",
    spatialAudio: true,
    dataSaver: false,
    normalization: "normal",
  };
  const migrated = migrateLegacySettings(source);
  assert.equal(migrated.audioOnly, true);
  assert.equal(migrated.dataSaver, false);
  assert.equal(migrated.normalization, "normal");
  assert.equal("videoQuality" in migrated, false);
  assert.equal("streamingQuality" in migrated, false);
  assert.equal("spatialAudio" in migrated, false);
  assert.deepEqual(source, {
    videoQuality: "audio-only",
    streamingQuality: "very-high",
    spatialAudio: true,
    dataSaver: false,
    normalization: "normal",
  });
});

test("explicit supported audioOnly wins over non-audio legacy video quality", () => {
  assert.deepEqual(
    migrateLegacySettings({ audioOnly: true, videoQuality: "1080p" }),
    { audioOnly: true },
  );
  assert.deepEqual(
    migrateLegacySettings({ audioOnly: false, videoQuality: "audio-only" }),
    { audioOnly: true },
  );
});

test("non-object settings migrate to an empty supported payload", () => {
  assert.deepEqual(migrateLegacySettings(null), {});
  assert.deepEqual(migrateLegacySettings([]), {});
  assert.deepEqual(migrateLegacySettings("auto"), {});
});

test("active runtime sources no longer depend on retired capability fields", async () => {
  const files = [
    "src/redux/features/settingsSlice.js",
    "src/app/api/settings/route.js",
    "src/models/UserData.js",
    "src/components/MusicPlayer/index.jsx",
    "src/components/MusicPlayer/YouTubePlayer.jsx",
  ];
  const contents = await Promise.all(files.map((file) => readFile(path.join(root, file), "utf8")));
  for (const [index, content] of contents.entries()) {
    assert.doesNotMatch(content, /\bstreamingQuality\b/, files[index]);
    assert.doesNotMatch(content, /\bvideoQuality\b/, files[index]);
    assert.doesNotMatch(content, /\bspatialAudio\b/, files[index]);
  }
});
