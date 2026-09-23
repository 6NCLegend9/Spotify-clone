import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(join(root, "src/components/MusicPlayer/playerDock.module.css"), "utf8");

test("desktop dock keeps volume visible at normal desktop widths", () => {
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*?\.volume \{ display: flex;/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*?minmax\(216px,1fr\)/);
  assert.doesNotMatch(css, /@media \(min-width: 1440px\) \{ \.volume \{ display: block;/);
});
