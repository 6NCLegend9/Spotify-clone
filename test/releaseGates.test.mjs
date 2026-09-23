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

test("Vercel builds the Next.js app on Node 22", () => {
  const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  const vercel = JSON.parse(readFileSync(join(projectRoot, "vercel.json"), "utf8"));
  assert.equal(pkg.engines.node, "22.x");
  assert.equal(vercel.framework, "nextjs");
  assert.equal(vercel.installCommand, "npm ci");
  assert.equal(vercel.buildCommand, "npm run build");
  assert.equal(vercel.git?.deploymentEnabled?.main, true);
  assert.equal(vercel.git?.deploymentEnabled?.["desktop-app-development"], false);
});

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


test("desktop CI builds update artifacts but never publishes a private GitHub updater feed", () => {
  const workflow = readFileSync(join(projectRoot, ".github/workflows/desktop-ci.yml"), "utf8");
  assert.match(workflow, /Stamp main-channel update version/);
  assert.match(workflow, /desktop\/dist\/latest\.yml/);
  assert.doesNotMatch(workflow, /tag_name:\s*desktop-latest/);
  assert.doesNotMatch(workflow, /prepare-github-release/);
  assert.doesNotMatch(workflow, /BLOB_READ_WRITE_TOKEN/);
});

test("desktop preview is an artifact build and does not pretend private GitHub releases are public", () => {
  const preview = readFileSync(join(projectRoot, ".github/workflows/desktop-preview.yml"), "utf8");
  assert.doesNotMatch(preview, /environment:\s*desktop-release/);
  assert.doesNotMatch(preview, /tag_name:\s*desktop-preview/);
  assert.doesNotMatch(preview, /prepare-github-release/);
  assert.match(preview, /desktop\/dist\/latest\.yml/);
});

test("manual desktop release isolates signing secrets and enforces a version preflight", () => {
  const release = readFileSync(join(projectRoot, ".github/workflows/desktop-release.yml"), "utf8");
  assert.match(release, /internal-release:/);
  assert.match(release, /signed-release:/);
  assert.match(release, /if: inputs\.channel != 'internal'/);
  assert.match(release, /environment: desktop-release/);
  assert.match(release, /HEYKASA_WINDOWS_CSC_LINK/);
  assert.match(release, /Validate release version monotonicity/);
  assert.match(release, /validate-release-version\.mjs/);
  assert.match(release, /Publish immutable release and update metadata/);
});
