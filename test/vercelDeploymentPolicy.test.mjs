import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = path.join(root, "scripts/vercel-ignore-build.mjs");

test("Vercel build policy skips only non-runtime preview changes", async () => {
  assert.equal(fs.existsSync(policyPath), true, "scripts/vercel-ignore-build.mjs must exist");
  const { shouldIgnoreVercelBuild } = await import(pathToFileURL(policyPath).href + `?t=${Date.now()}`);

  assert.equal(shouldIgnoreVercelBuild({
    branch: "refactor/unify-web-desktop-pr19",
    previousSha: "aaa",
    currentSha: "bbb",
    changedFiles: ["docs/plan.md", "test/unit.test.mjs", "desktop/src/main.mjs"],
  }), true);

  assert.equal(shouldIgnoreVercelBuild({
    branch: "refactor/unify-web-desktop-pr19",
    previousSha: "aaa",
    currentSha: "bbb",
    changedFiles: ["src/components/Searchbar.jsx", "test/search.test.mjs"],
  }), false);

  assert.equal(shouldIgnoreVercelBuild({
    branch: "refactor/unify-web-desktop-pr19",
    previousSha: "aaa",
    currentSha: "bbb",
    changedFiles: ["package.json"],
  }), false);
});

test("Vercel build policy always builds main and fails open when git history is unavailable", async () => {
  assert.equal(fs.existsSync(policyPath), true, "scripts/vercel-ignore-build.mjs must exist");
  const { shouldIgnoreVercelBuild } = await import(pathToFileURL(policyPath).href + `?t=${Date.now()}`);

  assert.equal(shouldIgnoreVercelBuild({
    branch: "main",
    previousSha: "aaa",
    currentSha: "bbb",
    changedFiles: ["docs/README.md"],
  }), false);

  assert.equal(shouldIgnoreVercelBuild({
    branch: "feature",
    previousSha: "",
    currentSha: "bbb",
    changedFiles: ["docs/README.md"],
  }), false);

  assert.equal(shouldIgnoreVercelBuild({
    branch: "feature",
    previousSha: "aaa",
    currentSha: "bbb",
    changedFiles: [],
  }), false);
});

test("vercel.json enables the repository ignored-build command", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.equal(config.ignoreCommand, "node scripts/vercel-ignore-build.mjs");
});
