import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const repository = "6NCLegend9/Spotify-clone";
const runId = process.env.ANDROID_PREVIEW_RUN_ID || "39041930548";
const maximum = 100 * 1024 * 1024;
const apkName = "HayKasa-Android.apk";
const tag = "android-preview";
class PublicationError extends Error {}
function requireValue(condition, message) { if (!condition) throw new PublicationError(message); }
function gh(args) { return execFileSync("gh", args, { maxBuffer: maximum, stdio: ["ignore", "pipe", "pipe"] }); }
function api(endpoint, allowMissing = false) {
  try { return JSON.parse(gh(["api", `repos/${repository}/${endpoint}`]).toString()); }
  catch (error) {
    if (allowMissing && /HTTP 404/.test(String(error.stderr))) return null;
    throw new PublicationError("Could not verify GitHub release provenance.");
  }
}
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function main() {
  requireValue(process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REPOSITORY === repository, "Publish only in this repository's GitHub Actions workflow.");
  requireValue(/^\d{1,15}$/.test(runId), "Invalid Android workflow run ID.");
  const run = api(`actions/runs/${runId}`);
  requireValue(run.status === "completed" && run.conclusion === "success" && run.path === ".github/workflows/android-ci.yml"
    && run.head_repository?.full_name === repository && /^[a-f0-9]{40}$/.test(run.head_sha || ""), "A successful Android APK workflow from this repository is required.");
  let merged = false;
  try { execFileSync("git", ["merge-base", "--is-ancestor", run.head_sha, "origin/main"], { stdio: "ignore" }); merged = true; } catch { /* Reject source outside main. */ }
  requireValue(merged, "Android source must already be merged into main.");
  const jobs = api(`actions/runs/${runId}/jobs?per_page=100`).jobs;
  requireValue(["apk", "emulator"].every(name => jobs?.some(job => job.name === name && job.conclusion === "success")), "Both APK and emulator jobs must pass before publication.");
  const artifacts = api(`actions/runs/${runId}/artifacts?per_page=100`).artifacts;
  const matches = artifacts?.filter(artifact => /^haykasa-android-debug-[a-f0-9]{40}$/.test(artifact.name || "") && !artifact.expired) || [];
  requireValue(matches.length === 1, "Exactly one unexpired Android debug artifact is required.");
  const artifact = matches[0];
  requireValue(Number.isSafeInteger(artifact.id) && artifact.size_in_bytes > 0 && artifact.size_in_bytes < maximum && /^sha256:[a-f0-9]{64}$/.test(artifact.digest || ""), "Artifact digest or size is invalid.");
  const archive = gh(["api", `repos/${repository}/actions/artifacts/${artifact.id}/zip`]);
  requireValue(`sha256:${sha256(archive)}` === artifact.digest, "Artifact archive digest mismatch.");
  fs.writeFileSync("android-preview-artifact.zip", archive);
  const entries = execFileSync("unzip", ["-Z1", "android-preview-artifact.zip"], { encoding: "utf8", maxBuffer: 4096 }).trim();
  requireValue(entries === "app-debug.apk", "Unexpected artifact archive contents.");
  const apk = execFileSync("unzip", ["-p", "android-preview-artifact.zip", "app-debug.apk"], { maxBuffer: maximum });
  requireValue(apk.length > 0 && apk.length < maximum, "Invalid APK size.");
  fs.writeFileSync(apkName, apk);
  const signature = execFileSync("jarsigner", ["-verify", apkName], { encoding: "utf8", maxBuffer: 64000, env: { ...process.env, LC_ALL: "C" } });
  requireValue(/jar verified\./i.test(signature), "APK JAR signature verification failed.");
  const digest = sha256(apk);
  const existing = api(`releases/tags/${tag}`, true);
  if (existing) {
    const asset = existing.assets?.find(value => value.name === apkName);
    requireValue(existing.draft === false && existing.prerelease === true && asset?.state === "uploaded" && asset.digest === `sha256:${digest}` && asset.size === apk.length, "A different preview already exists; replacement requires a deliberate release operation.");
    console.log("Verified existing Android preview; no release was replaced.");
    return;
  }
  const notes = `Download **${apkName}** below and open it on Android 6.0+. Allow installation from your browser if Android asks. No ZIP extraction or GitHub account is needed.\n\nThis is a debug-signed **Android Preview**, not a Play Store or production-signed release. An older preview signed with a different test key may need to be uninstalled first. Automatic Android updates are not provided.\n\nThe app uses HayKasa's live mobile website. Embedded YouTube remains a foreground fallback; native source audio requires verified backend activation. Live extraction and physical-device behavior remain unverified.\n\nVerified build: https://github.com/${repository}/actions/runs/${runId} . Source commit: ${run.head_sha}, merged into main.\n\nAPK SHA-256: \`${digest}\`.\n`;
  fs.writeFileSync("android-preview-notes.md", notes);
  gh(["release", "create", tag, apkName, "--repo", repository, "--target", run.head_sha, "--prerelease", "--latest=false", "--title", "HayKasa Android Preview", "--notes-file", "android-preview-notes.md"]);
  const published = api(`releases/tags/${tag}`);
  const uploaded = published.assets?.find(asset => asset.name === apkName);
  requireValue(published.draft === false && published.prerelease === true && uploaded?.state === "uploaded" && uploaded.digest === `sha256:${digest}` && uploaded.size === apk.length, "Published APK metadata did not match the tested artifact.");
  console.log(`Published verified Android preview: https://github.com/${repository}/releases/download/${tag}/${apkName}`);
}
try { main(); } catch (error) {
  // Child-process stderr can contain temporary signed URLs. Keep failures terse.
  console.error(error instanceof PublicationError ? error.message : "Android preview publication failed.");
  process.exitCode = 1;
}
