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
  let tracked;
  try {
    tracked = execFileSync(
      "git",
      ["-c", `safe.directory=${projectRoot}`, "ls-files", "--", "public/sw.js"],
      { cwd: projectRoot, encoding: "utf8" },
    ).trim();
  } catch (error) {
    const detail = `${error?.stderr || ""} ${error?.message || ""}`;
    if (/dubious ownership|not a git repository/i.test(detail)) {
      assert.ok(true, "git index is unavailable in this environment");
      return;
    }
    throw error;
  }
  assert.equal(tracked, "", "public/sw.js is generated and must remain untracked");
});

test("active UI does not link to legacy catalog routes", () => {
  const legacyRoute = /["'`]\/(?:album|playlist)(?:\/|[?"'`])/;
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
    `legacy /album or /playlist link found in: ${violations.join(", ")}`,
  );
});

test("public discovery does not advertise private libraries or fabricated freshness", () => {
  const sitemap = readFileSync(join(projectRoot, "src/app/sitemap.js"), "utf8");
  const searchMetadata = readFileSync(joinRoot("src/app/search/[query]/layout.js"), "utf8");
  assert.equal(sitemap.includes("new Date()"), false);
  assert.equal(sitemap.includes("/library"), false);
  assert.equal(sitemap.includes("POPULAR_SEARCH_TERMS"), false);
  assert.match(searchMetadata, /robots: \{ index: false, follow: true \}/);
});

function joinRoot(path) { return join(projectRoot, path); }
