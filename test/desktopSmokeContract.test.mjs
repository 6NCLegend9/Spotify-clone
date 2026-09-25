import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("desktop exposes a shared-renderer Electron smoke command", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "desktop/package.json"), "utf8"));
  assert.equal(pkg.scripts["smoke:renderer"], "node scripts/smoke-renderer.mjs");
  const source = await readFile(path.join(root, "desktop/scripts/smoke-renderer.mjs"), "utf8");
  assert.match(source, /HEYKASA_DESKTOP_SMOKE_URL/);
  assert.match(source, /window\.heykasaDesktop/);
  assert.match(source, /window\.require/);
  assert.match(source, /\/search/);
});
