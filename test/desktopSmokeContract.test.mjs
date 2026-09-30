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
  const routeIndex = source.indexOf('app.context().route("**/api/**"');
  const firstWindowIndex = source.indexOf("app.firstWindow()");
  const controlledNavigationIndex = source.indexOf('await page.goto(`${origin}/search`');
  const errorListenerIndex = source.indexOf('page.on("pageerror"');
  const monitoredReloadIndex = source.indexOf("await page.reload(");
  assert.ok(routeIndex >= 0, "Electron smoke must install API interception on the app context.");
  assert.ok(routeIndex < firstWindowIndex, "API interception must be installed before the first renderer window can request data.");
  assert.ok(controlledNavigationIndex >= 0, "Electron smoke must establish a controlled mocked renderer navigation.");
  assert.ok(errorListenerIndex > controlledNavigationIndex, "Startup console noise must not pollute the monitored renderer pass.");
  assert.ok(monitoredReloadIndex > errorListenerIndex, "Electron smoke must monitor a fresh reload after listeners are attached.");
});
