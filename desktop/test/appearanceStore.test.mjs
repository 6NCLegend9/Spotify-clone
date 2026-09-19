import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AppearanceStore,
  MAX_APPEARANCE_PROFILES,
  appearanceAssetId,
  sanitizeAppearanceProfile,
} from "../src/appearanceStore.mjs";

function temporaryStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heykasa-appearance-"));
  return { directory, store: new AppearanceStore(directory) };
}

test("appearance profiles sanitize bounded user-controlled values", () => {
  const profile = sanitizeAppearanceProfile({
    id: "../bad",
    name: ` Work ${"x".repeat(80)} `,
    background: {
      assetId: "not-an-asset",
      fileName: "../photo.png",
      positionX: -50,
      positionY: 500,
      zoom: 20,
      blur: -4,
      darkness: 0,
    },
    home: {
      visible: true,
      message: `<script>${"a".repeat(200)}</script>`,
      size: "huge",
      align: "sideways",
    },
    accent: { mode: "rainbow", fixedColor: "red" },
  });

  assert.notEqual(profile.id, "../bad");
  assert.equal(profile.name.length, 40);
  assert.equal(profile.background.assetId, "");
  assert.equal(profile.background.positionX, 0);
  assert.equal(profile.background.positionY, 100);
  assert.equal(profile.background.zoom, 1.8);
  assert.equal(profile.background.blur, 0);
  assert.equal(profile.background.darkness, 0.2);
  assert.equal(profile.home.message.length, 160);
  assert.equal(profile.home.size, "medium");
  assert.equal(profile.home.align, "left");
  assert.equal(profile.accent.fixedColor, "#00e6e6");
});

test("appearance store persists profiles and reports missing owned backgrounds", () => {
  const { directory, store } = temporaryStore();
  try {
    const asset = store.registerAsset({ fileName: "my photo.png" });
    fs.mkdirSync(store.backgroundsDirectory, { recursive: true });
    fs.writeFileSync(store.assetPath(asset.id), "image");
    const profile = {
      ...store.activeProfile(),
      name: "Work",
      background: {
        ...store.activeProfile().background,
        assetId: asset.id,
        fileName: asset.fileName,
      },
    };
    store.saveProfile(profile);

    const restored = new AppearanceStore(directory);
    assert.equal(restored.activeProfile().name, "Work");
    assert.equal(restored.resolve().backgroundUrl, `heykasa-media://background/${asset.id}`);
    fs.rmSync(restored.assetPath(asset.id));
    const missing = restored.resolve();
    assert.equal(missing.backgroundUrl, "");
    assert.deepEqual(missing.warning, {
      code: "BACKGROUND_MISSING",
      fileName: "my photo.png",
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("profile and asset limits preserve a safe bounded store", () => {
  const { directory, store } = temporaryStore();
  try {
    for (let index = 1; index < MAX_APPEARANCE_PROFILES; index += 1) {
      store.saveProfile({ ...store.activeProfile(), id: "", name: `Profile ${index}` });
    }
    assert.equal(store.getAll().profiles.length, MAX_APPEARANCE_PROFILES);
    assert.throws(
      () => store.saveProfile({ ...store.activeProfile(), id: "", name: "Too many" }),
      /up to 12/,
    );

    const unused = store.registerAsset({ fileName: "unused.jpg" });
    fs.mkdirSync(store.backgroundsDirectory, { recursive: true });
    fs.writeFileSync(store.assetPath(unused.id), "unused");
    assert.equal(store.discardAsset(unused.id), true);
    assert.equal(fs.existsSync(path.join(store.backgroundsDirectory, `${unused.id}.jpg`)), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("appearance asset URLs reject traversal and unknown shapes", () => {
  assert.match(
    appearanceAssetId("heykasa-media://background/123e4567-e89b-42d3-a456-426614174000"),
    /^[0-9a-f-]{36}$/i,
  );
  assert.equal(appearanceAssetId("heykasa-media://background/../../secret"), "");
  assert.equal(appearanceAssetId("file:///tmp/background.jpg"), "");
  assert.equal(appearanceAssetId("https://example.com/background.jpg"), "");
});
