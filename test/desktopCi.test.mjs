import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("desktop CI watches the shared product renderer and runs Electron smoke", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/desktop-ci.yml"), "utf8");
  assert.match(workflow, /- "src\/\*\*"/);
  assert.match(workflow, /- "contracts\/\*\*"/);
  assert.match(workflow, /check:desktop-contract/);
  assert.match(workflow, /smoke:renderer/);
  assert.doesNotMatch(workflow, /Build unsigned Windows installer/);
});

test("desktop package CI owns Windows packaging and launches the packaged runtime", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/desktop-package-ci.yml"), "utf8");
  const pkg = JSON.parse(readFileSync(path.join(root, "desktop/package.json"), "utf8"));
  assert.match(workflow, /- "desktop\/\*\*"/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /npm --prefix desktop pkg set heykasaReleaseChannel=internal/);
  assert.match(workflow, /npm --prefix desktop run dist/);
  assert.match(workflow, /Verify packaged Windows runtime/);
  assert.match(workflow, /npm --prefix desktop run smoke:packaged/);
  assert.equal(pkg.scripts["smoke:packaged"], "node scripts/verify-packaged-runtime.mjs");
  assert.match(workflow, /prepare-github-release/);
});


test("desktop preview workflow stamps the immutable internal build channel before packaging", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/desktop-preview.yml"), "utf8");
  assert.match(workflow, /working-directory:\s*desktop/);
  assert.match(workflow, /npm pkg set heykasaReleaseChannel=internal/);
  const stampIndex = workflow.indexOf("npm pkg set heykasaReleaseChannel=internal");
  const buildIndex = workflow.indexOf("npm run dist");
  assert.ok(stampIndex >= 0, "Preview workflow must stamp the internal build channel.");
  assert.ok(buildIndex > stampIndex, "Preview build channel must be stamped before packaging.");
});

test("desktop release workflow stamps the immutable build update channel before packaging", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/desktop-release.yml"), "utf8");
  const pkg = JSON.parse(readFileSync(path.join(root, "desktop/package.json"), "utf8"));
  assert.equal(pkg.heykasaReleaseChannel, "stable");
  assert.match(workflow, /npm pkg set heykasaReleaseChannel=internal/);
  assert.match(workflow, /npm pkg set heykasaReleaseChannel="\$\{\{ inputs\.channel \}\}"/);
});


test("desktop release workflow launches each packaged build before preparing publication assets", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/desktop-release.yml"), "utf8");
  const smokeMatches = workflow.match(/Verify packaged Windows runtime/g) || [];
  const smokeCommands = workflow.match(/npm run smoke:packaged/g) || [];
  assert.equal(smokeMatches.length, 2, "Internal and signed release jobs must both launch the packaged runtime.");
  assert.equal(smokeCommands.length, 2, "Internal and signed release jobs must both execute smoke:packaged.");

  const internalBuild = workflow.indexOf("Build internal Windows installer");
  const internalSmoke = workflow.indexOf("Verify packaged Windows runtime", internalBuild);
  const internalPrepare = workflow.indexOf("Prepare GitHub release bundle", internalBuild);
  assert.ok(internalBuild >= 0 && internalSmoke > internalBuild && internalPrepare > internalSmoke);

  const signedBuild = workflow.indexOf("Build signed Windows installer");
  const signedSmoke = workflow.indexOf("Verify packaged Windows runtime", signedBuild);
  const signedPrepare = workflow.indexOf("Prepare GitHub release bundle", signedBuild);
  assert.ok(signedBuild >= 0 && signedSmoke > signedBuild && signedPrepare > signedSmoke);
});
