import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "../src/cachePolicy.mjs");

test("renderer cache resets only when the cache schema changes", async () => {
  assert.equal(fs.existsSync(sourcePath), true, "desktop/src/cachePolicy.mjs must exist");
  const { shouldResetRendererCache } = await import(pathToFileURL(sourcePath));
  assert.equal(shouldResetRendererCache({ storedSchema: 0, currentSchema: 1 }), true);
  assert.equal(shouldResetRendererCache({ storedSchema: 1, currentSchema: 1 }), false);
  assert.equal(shouldResetRendererCache({ storedSchema: 1, currentSchema: 2 }), true);
  assert.equal(shouldResetRendererCache({ storedSchema: "bad", currentSchema: 1 }), true);
});

test("app version changes do not force cache reset when renderer schema is unchanged", async () => {
  assert.equal(fs.existsSync(sourcePath), true, "desktop/src/cachePolicy.mjs must exist");
  const { shouldResetRendererCache } = await import(pathToFileURL(sourcePath));
  assert.equal(shouldResetRendererCache({
    storedSchema: 1,
    currentSchema: 1,
    previousAppVersion: "1.0.0",
    appVersion: "2.0.0",
  }), false);
});
