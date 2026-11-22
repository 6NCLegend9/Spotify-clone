import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { FileMatcher } = require("app-builder-lib/out/fileMatcher.js");
const metadata = require("../package.json");
const root = fileURLToPath(new URL("../", import.meta.url));
const file = { isDirectory: () => false };
const directory = { isDirectory: () => true };
const matcher = patterns => new FileMatcher(root, root, value => value, patterns).createFilter();
const allowed = (filter, relative, stat = file) => filter(path.join(root, relative), stat);

test("actual builder includes desktop runtime and excludes repository/build inputs", () => {
  const filter = matcher(metadata.build.files);
  for (const name of ["package.json", "src/main.mjs", "src/preload.cjs", "src/miniPlayer.html", "src/generated/desktopContract.mjs", "src/icons/thumbar/play.png"]) {
    assert.equal(allowed(filter, name), true, name);
  }
  for (const name of [".env", "package-lock.json", "scripts/check-auto-release.mjs", "dist/old.exe", "build/signing.pfx"]) {
    assert.equal(allowed(filter, name), false, name);
  }
  assert.equal(allowed(filter, "src", directory), true, "Traversal must reach nested runtime files");
});

test("builder brace and exclusion patterns retain their ordering", () => {
  const filter = matcher(["src/**/*.{mjs,cjs,map}", "!**/*.map", "!src/private/**"]);
  assert.equal(allowed(filter, "src/main.mjs"), true);
  assert.equal(allowed(filter, "src/preload.cjs"), true);
  assert.equal(allowed(filter, "src/main.mjs.map"), false);
  assert.equal(allowed(filter, "src/private/key.mjs"), false);
  assert.equal(allowed(filter, "src/miniPlayer.html"), false);
});

test("extensionless directory rules still include their descendants", () => {
  const filter = matcher(["assets", "!assets/private/**"]);
  assert.equal(allowed(filter, "assets", directory), true);
  assert.equal(allowed(filter, "assets/nested/icon.png"), true);
  assert.equal(allowed(filter, "assets/private/key"), false);
  assert.equal(allowed(filter, "outside/icon.png"), false);
});
