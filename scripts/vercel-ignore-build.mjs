import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const NON_RUNTIME_PREFIXES = Object.freeze([
  ".github/",
  "desktop/",
  "desktop-bridge/",
  "docs/",
  "e2e/",
  "test/",
  "artifacts/",
  "playwright-report/",
  "test-results/",
]);

function normalizedPath(value) {
  return String(value || "").trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isNonRuntimeVercelPath(value) {
  const file = normalizedPath(value);
  if (!file) return false;
  if (NON_RUNTIME_PREFIXES.some((prefix) => file.startsWith(prefix))) return true;
  if (!file.includes("/") && (file.endsWith(".md") || file === "LICENSE" || file === "LICENSE.txt")) return true;
  return false;
}

export function shouldIgnoreVercelBuild({
  branch = "",
  previousSha = "",
  currentSha = "",
  changedFiles = [],
} = {}) {
  const ref = String(branch || "").trim();
  const previous = String(previousSha || "").trim();
  const current = String(currentSha || "").trim();
  const files = Array.isArray(changedFiles)
    ? changedFiles.map(normalizedPath).filter(Boolean)
    : [];

  // Production must always build. If Vercel cannot prove what changed, fail
  // open and build rather than risk skipping a renderer/API change.
  if (ref === "main" || !previous || !current || previous === current || files.length === 0) return false;
  return files.every(isNonRuntimeVercelPath);
}

export function changedFilesBetween(previousSha, currentSha) {
  const previous = String(previousSha || "").trim();
  const current = String(currentSha || "").trim();
  if (!previous || !current || previous === current) return [];
  const output = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", previous, current],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return output.split(/\r?\n/).map(normalizedPath).filter(Boolean);
}

function run() {
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
  const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA || "";
  const currentSha = process.env.VERCEL_GIT_COMMIT_SHA || "";

  let changedFiles = [];
  try {
    changedFiles = changedFilesBetween(previousSha, currentSha);
  } catch (error) {
    process.stderr.write(`Vercel ignore check could not inspect Git history; building normally. ${error instanceof Error ? error.message : ""}\n`);
    process.exitCode = 1;
    return;
  }

  const ignore = shouldIgnoreVercelBuild({
    branch,
    previousSha,
    currentSha,
    changedFiles,
  });

  process.stdout.write(`${JSON.stringify({
    event: "vercel_ignored_build_check",
    branch,
    ignore,
    changedFiles,
  })}\n`);

  // Vercel's ignoreCommand contract: exit 0 skips the build; exit 1 builds it.
  process.exitCode = ignore ? 0 : 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) run();
