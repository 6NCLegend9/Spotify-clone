import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "../src/ciSmoke.mjs");

test("packaged CI smoke requires both the explicit switch and GitHub Actions", async () => {
  assert.equal(fs.existsSync(sourcePath), true, "desktop/src/ciSmoke.mjs must exist");
  const { isPackagedCiSmoke } = await import(pathToFileURL(sourcePath));
  assert.equal(isPackagedCiSmoke([], {}), false);
  assert.equal(isPackagedCiSmoke(["--heykasa-ci-smoke"], {}), false);
  assert.equal(isPackagedCiSmoke([], { GITHUB_ACTIONS: "true" }), false);
  assert.equal(isPackagedCiSmoke(["--heykasa-ci-smoke"], { GITHUB_ACTIONS: "true" }), true);
});

test("packaged CI smoke uses one fixed result filename", async () => {
  assert.equal(fs.existsSync(sourcePath), true, "desktop/src/ciSmoke.mjs must exist");
  const { PACKAGED_CI_SMOKE_RESULT_FILE } = await import(pathToFileURL(sourcePath));
  assert.equal(PACKAGED_CI_SMOKE_RESULT_FILE, "heykasa-packaged-smoke.json");
});
