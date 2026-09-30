import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("desktop contract is canonical and generated outputs match it", async () => {
  const contract = JSON.parse(await readFile(path.join(root, "contracts/desktop.json"), "utf8"));
  assert.equal(contract.apiVersion, 1);
  assert.equal(new Set(contract.capabilities).size, contract.capabilities.length);
  assert.deepEqual(contract.capabilities, [
    "discordPresenceV1",
    "updaterV1",
    "autoLaunchV1",
    "desktopPreferencesV1",
    "appearanceProfilesV1",
    "trayV1",
    "diagnosticsV1",
    "authV1",
  ]);

  const webGenerated = await readFile(path.join(root, "src/generated/desktopContract.mjs"), "utf8");
  const desktopGenerated = await readFile(path.join(root, "desktop/src/generated/desktopContract.mjs"), "utf8");
  for (const capability of contract.capabilities) {
    assert.match(webGenerated, new RegExp(JSON.stringify(capability)));
    assert.match(desktopGenerated, new RegExp(JSON.stringify(capability)));
  }
  assert.match(webGenerated, /CURRENT_DESKTOP_API_VERSION = 1/);
  assert.match(desktopGenerated, /DESKTOP_API_VERSION = 1/);
});
