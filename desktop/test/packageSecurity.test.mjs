import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DISCORD_CLIENT_ID } from "../src/discord/ipcClient.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));

test("packaged Electron security fuses stay fail-closed", () => {
  assert.equal(packageJson.build?.asar, true);
  assert.deepEqual(packageJson.build?.electronFuses, {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false,
    grantFileProtocolExtraPrivileges: false,
  });
  assert.equal(packageJson.build?.win?.verifyUpdateCodeSignature, true);
  assert.equal(packageJson.build?.win?.requestedExecutionLevel, "asInvoker");
});

test("Discord application identity is pinned in the native shell", () => {
  assert.equal(DISCORD_CLIENT_ID, "1550162988407857252");
});
