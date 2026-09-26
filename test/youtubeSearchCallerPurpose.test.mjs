import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const allowed = new Set([
  "src/app/api/youtube-search/route.js",
  "src/utils/youtubeSearchUrl.mjs",
]);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    if (!/\.(?:js|jsx|ts|tsx|mjs)$/.test(entry.name)) return [];
    return [target];
  });
}

test("production youtube-search callers use the purpose-aware URL builder", () => {
  const direct = sourceFiles(src)
    .filter((file) => fs.readFileSync(file, "utf8").includes("/api/youtube-search"))
    .map((file) => path.relative(root, file).replaceAll("\\", "/"))
    .filter((file) => !allowed.has(file))
    .sort();
  assert.deepEqual(direct, []);
});
