import assert from "node:assert/strict";
import test from "node:test";
import {
  accentFromBitmap,
  contrastRatio,
  foregroundForAccent,
  isAllowedArtworkUrl,
} from "../src/artworkPalette.mjs";

test("artwork palette accepts only the expected HTTPS image hosts", () => {
  assert.equal(isAllowedArtworkUrl("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"), true);
  assert.equal(isAllowedArtworkUrl("https://yt3.ggpht.com/avatar"), true);
  assert.equal(isAllowedArtworkUrl("http://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"), false);
  assert.equal(isAllowedArtworkUrl("https://i.ytimg.com.evil.example/image.jpg"), false);
  assert.equal(isAllowedArtworkUrl("file:///C:/Users/test/image.jpg"), false);
});

test("artwork palette chooses a saturated contrast-safe accent", () => {
  const bitmap = Buffer.alloc(32 * 32 * 4);
  for (let index = 0; index < bitmap.length; index += 4) {
    bitmap[index] = 25;
    bitmap[index + 1] = 75;
    bitmap[index + 2] = 220;
    bitmap[index + 3] = 255;
  }
  const accent = accentFromBitmap(bitmap);
  assert.match(accent, /^#[0-9a-f]{6}$/);
  assert.notEqual(accent, "#00e6e6");
  const rgb = accent.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16));
  assert.equal(contrastRatio(rgb, [2, 8, 19]) >= 4.5, true);
});

test("accent foreground falls back safely for bright and dark colors", () => {
  assert.equal(foregroundForAccent("#f5e642"), "#001014");
  assert.equal(foregroundForAccent("#181828"), "#ffffff");
  assert.equal(foregroundForAccent("invalid"), "#001014");
});
