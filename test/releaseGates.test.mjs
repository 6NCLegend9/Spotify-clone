import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (path === join(projectRoot, "src", "app", "api")) return [];
      return sourceFiles(path);
    }
    return [".js", ".jsx", ".mjs"].includes(extname(entry.name)) ? [path] : [];
  });
}

test("generated service worker is not tracked", () => {
  const tracked = execFileSync("git", ["ls-files", "--", "public/sw.js"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
  assert.equal(tracked, "", "public/sw.js is generated and must remain untracked");
});

test("active UI does not link to legacy catalog routes", () => {
  const legacyRoute = /["'`]\/(?:album|artist|playlist)(?:\/|[?"'`])/;
  const files = [
    ...sourceFiles(join(projectRoot, "src", "app")),
    ...sourceFiles(join(projectRoot, "src", "components")),
  ];
  const violations = files
    .filter((file) => legacyRoute.test(readFileSync(file, "utf8")))
    .map((file) => relative(projectRoot, file));

  assert.deepEqual(
    violations,
    [],
    `legacy /album, /artist, or /playlist link found in: ${violations.join(", ")}`,
  );
});
