import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PACKAGED_CI_SMOKE_RESULT_FILE } from "../src/ciSmoke.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = path.join(desktopRoot, "dist", "win-unpacked", "HayKasa.exe");
const resultFile = path.join(os.tmpdir(), PACKAGED_CI_SMOKE_RESULT_FILE);
const timeoutMs = 60_000;

assert.equal(process.platform, "win32", "Packaged runtime smoke is Windows-only.");
assert.equal(fs.existsSync(executable), true, `Packaged HayKasa executable was not found: ${executable}`);
fs.rmSync(resultFile, { force: true });

const child = spawn(executable, ["--heykasa-ci-smoke"], {
  cwd: path.dirname(executable),
  env: {
    ...process.env,
    GITHUB_ACTIONS: "true",
  },
  stdio: "inherit",
  windowsHide: false,
});

const exitCode = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error("Packaged HayKasa smoke timed out."));
  }, timeoutMs);
  child.once("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.once("exit", (code) => {
    clearTimeout(timer);
    resolve(code);
  });
});

assert.equal(exitCode, 0, "Packaged HayKasa exited with a smoke failure.");
assert.equal(fs.existsSync(resultFile), true, "Packaged HayKasa did not write its smoke result.");
const result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
assert.equal(result.ok, true);
assert.equal(result.trustedRenderer, true);
assert.equal(result.hasDesktopBridge, true);
assert.equal(result.hasNodeRequire, false);
assert.match(result.url, /^https:\/\/haykasa\.vercel\.app(?:\/|$)/);
fs.rmSync(resultFile, { force: true });

process.stdout.write(`${JSON.stringify({ event: "packaged_desktop_smoke_passed", url: result.url })}\n`);
