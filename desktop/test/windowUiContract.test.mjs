import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(join(root, "src/main.mjs"), "utf8");

test("tray click restores the main app instead of opening a surprise mini player", () => {
  assert.match(source, /tray\.on\("click", \(\) => focusMainWindow\(\)\)/);
  assert.match(source, /label: miniWindow[\s\S]*?"Show mini player"/);
  assert.match(source, /function showMainWindow\(\)[\s\S]*?hideMiniPlayer\(\)/);
});

test("Windows thumbnail toolbar uses distinct transport glyphs", () => {
  const start = source.indexOf("function updateThumbar()");
  const end = source.indexOf("\nfunction ", start + 1);
  const body = source.slice(start, end);
  assert.match(body, /thumbarIcon\("previous"\)/);
  assert.match(body, /thumbarIcon\(playbackState\.playing \? "pause" : "play"\)/);
  assert.match(body, /thumbarIcon\("next"\)/);
  assert.doesNotMatch(body, /resourceIconPath\(\)/);
});
