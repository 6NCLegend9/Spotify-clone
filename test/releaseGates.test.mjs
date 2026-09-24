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

function joinRoot(path) { return join(projectRoot, path); }

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

test("desktop CI builds update artifacts but never publishes an end-user release", () => {
  const workflow = readFileSync(join(projectRoot, ".github/workflows/desktop-ci.yml"), "utf8");
  assert.match(workflow, /Stamp main-channel update version/);
  assert.match(workflow, /desktop\/dist\/latest\.yml/);
  assert.match(workflow, /Validate GitHub release bundle preparation/);
  assert.match(workflow, /npm run prepare-github-release/);
  assert.match(workflow, /desktop\/dist\/release-manifest\.json/);
  assert.doesNotMatch(workflow, /softprops\/action-gh-release/);
  assert.doesNotMatch(workflow, /BLOB_READ_WRITE_TOKEN/);
});

test("desktop preview remains an unsigned Actions artifact", () => {
  const preview = readFileSync(join(projectRoot, ".github/workflows/desktop-preview.yml"), "utf8");
  assert.doesNotMatch(preview, /environment:\s*desktop-release/);
  assert.doesNotMatch(preview, /softprops\/action-gh-release/);
  assert.match(preview, /desktop\/dist\/latest\.yml/);
});

test("manual desktop release publishes complete GitHub Release bundles without Vercel Blob", () => {
  const release = readFileSync(join(projectRoot, ".github/workflows/desktop-release.yml"), "utf8");
  const desktopPackage = JSON.parse(readFileSync(join(projectRoot, "desktop/package.json"), "utf8"));

  assert.equal(desktopPackage.scripts["prepare-github-release"], "node scripts/prepare-github-release.mjs");
  assert.match(release, /internal-release:/);
  assert.match(release, /signed-release:/);
  assert.match(release, /publish-signed:/);
  assert.match(release, /if: inputs\.channel != 'internal'/);
  assert.match(release, /environment: desktop-release/);
  assert.match(release, /HEYKASA_WINDOWS_CSC_LINK/);
  assert.match(release, /HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET/);
  assert.match(release, /Validate release version monotonicity/);
  assert.match(release, /validate-release-version\.mjs/);
  assert.match(release, /npm run prepare-github-release/);
  assert.match(release, /softprops\/action-gh-release@v2/);
  assert.match(release, /desktop-v\$\{\{ inputs\.version \}\}/);
  assert.match(release, /desktop-beta-v\$\{\{ inputs\.version \}\}/);
  assert.match(release, /desktop-internal-v\$\{\{ inputs\.version \}\}/);
  assert.match(release, /release\/latest\.yml/);
  assert.match(release, /release\/\*\.blockmap/);
  assert.match(release, /release\/release-manifest\.json/);
  assert.match(release, /Verify Authenticode signature/);
  assert.match(release, /Verify public GitHub release bundle/);
  assert.doesNotMatch(release, /BLOB_READ_WRITE_TOKEN/);
  assert.doesNotMatch(release, /Publish immutable release and update metadata/);
});


test("public desktop download and updater assets share the trusted release verifier", () => {
  const downloadRoute = readFileSync(join(projectRoot, "src/app/api/desktop/download/route.js"), "utf8");
  const updateRoute = readFileSync(join(projectRoot, "src/app/api/desktop/update/[channel]/[file]/route.js"), "utf8");
  const desktopCi = readFileSync(join(projectRoot, ".github/workflows/desktop-ci.yml"), "utf8");
  const releaseWorkflow = readFileSync(join(projectRoot, ".github/workflows/desktop-release.yml"), "utf8");

  assert.match(downloadRoute, /fetchVerifiedDesktopGithubRelease\("stable"\)/);
  assert.match(updateRoute, /fetchVerifiedDesktopGithubRelease\(channel\)/);
  assert.doesNotMatch(downloadRoute, /findLocalDesktopInstaller/);
  assert.doesNotMatch(downloadRoute, /HEYKASA_DESKTOP_DOWNLOAD_URL/);
  assert.match(desktopCi, /test\/desktopDownload\.test\.mjs/);
  assert.match(releaseWorkflow, /test\/desktopDownload\.test\.mjs/);
});

test("desktop window can traverse responsive breakpoints without crushing content", () => {
  const main = readFileSync(join(projectRoot, "desktop/src/main.mjs"), "utf8");
  const css = readFileSync(join(projectRoot, "src/app/globals.css"), "utf8");

  assert.match(main, /minWidth:\s*640/);
  assert.match(main, /minHeight:\s*520/);
  assert.match(css, /min-width:\s*768px\) and \(max-width:\s*1099px/);
  assert.match(css, /min-width:\s*1100px\) and \(max-width:\s*1359px/);
  assert.match(css, /@media \(min-width:\s*1360px\)/);
});
