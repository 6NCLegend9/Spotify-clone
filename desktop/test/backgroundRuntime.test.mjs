import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("desktop exposes and runs a hidden-window runtime measurement", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "desktop/package.json"), "utf8"));
  const workflow = readFileSync(path.join(root, ".github/workflows/desktop-ci.yml"), "utf8");
  assert.equal(pkg.scripts["measure:background"], "node scripts/measure-background-runtime.mjs");
  assert.match(workflow, /Measure hidden-window runtime/);
  assert.match(workflow, /npm --prefix desktop run measure:background/);
});

test("hidden-window measurement records visibility, timers, animation frames, and native playback commands", () => {
  const source = readFileSync(path.join(root, "desktop/scripts/measure-background-runtime.mjs"), "utf8");
  assert.match(source, /visibilityState/);
  assert.match(source, /intervalTicks/);
  assert.match(source, /animationFrames/);
  assert.match(source, /heykasa:playback:command/);
  assert.match(source, /hidden/);
});
