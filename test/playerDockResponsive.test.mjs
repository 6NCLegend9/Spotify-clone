import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DESKTOP_QUERY } from "../src/utils/responsivePolicy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(join(root, "src/components/MusicPlayer/playerDock.module.css"), "utf8");

test("desktop dock keeps volume visible under the shared desktop policy", () => {
  assert.equal(css.includes(`@media ${DESKTOP_QUERY}`), true);
  assert.match(css, /@media \(min-width: 1181px\), \(min-width: 1024px\) and \(pointer: fine\)[\s\S]*?minmax\(216px,1fr\)/);
  assert.doesNotMatch(css, /@media \(min-width: 768px\) \{/);
  assert.doesNotMatch(css, /@media \(min-width: 1440px\) \{ \.volume \{ display: block;/);
});
