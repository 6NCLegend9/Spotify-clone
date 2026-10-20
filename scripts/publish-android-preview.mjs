import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { ANDROID_RELEASE_REPOSITORY, ANDROID_PREVIEW_TAG_PREFIX, ANDROID_PREVIEW_METADATA_MARKER,
  ANDROID_APK_NAME, androidDownloadFromRelease } from "../src/utils/androidDownload.mjs";

const repository = ANDROID_RELEASE_REPOSITORY;
const runId = process.env.ANDROID_PREVIEW_RUN_ID;
const maximum = 100 * 1024 * 1024;
const apkName = ANDROID_APK_NAME;
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
function timestamp(value) {
  const date = new Date(value);
  requireValue(typeof value === "string" && Number.isFinite(date.getTime()), "Invalid Android build timestamp.");
  return date.toISOString();
}
function completeList(endpoint, key) {
  const result = api(endpoint);
  requireValue(Array.isArray(result[key]) && Number.isSafeInteger(result.total_count)
    && result.total_count >= 0 && result.total_count <= 100 && result[key].length === result.total_count,
  "Incomplete GitHub workflow listing; publication refused.");
  return result[key];
}
function tagCommit(tag) {
  const reference = api(`git/ref/tags/${tag}`, true);
  if (!reference) return null;
  requireValue(reference.ref === `refs/tags/${tag}`, "Unexpected Android preview tag reference.");
  let object = reference.object;
  for (let depth = 0; depth < 4; depth++) {
    requireValue(/^[a-f0-9]{40}$/.test(object?.sha || ""), "Invalid Android preview tag target.");
    if (object.type === "commit") return object.sha;
    requireValue(object.type === "tag", "Invalid Android preview tag target.");
    object = api(`git/tags/${object.sha}`).object;
  }
  throw new PublicationError("Android preview tag nesting is too deep.");
}

function main() {
  requireValue(process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REPOSITORY === repository, "Publish only in this repository's GitHub Actions workflow.");
  requireValue(process.env.GITHUB_REF === "refs/heads/main"
    && process.env.GITHUB_WORKFLOW_REF === `${repository}/.github/workflows/android-preview-release.yml@refs/heads/main`
    && ["workflow_run", "workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME), "Publish only from the trusted main preview workflow.");
  requireValue(/^[1-9]\d{0,14}$/.test(runId || ""), "An explicit Android workflow run ID is required.");
  const run = api(`actions/runs/${runId}`);
  requireValue(run.id === Number(runId) && run.status === "completed" && run.conclusion === "success"
    && run.path === ".github/workflows/android-ci.yml" && run.head_branch === "main"
    && ["push", "workflow_dispatch"].includes(run.event) && run.repository?.full_name === repository
    && run.head_repository?.full_name === repository && /^[a-f0-9]{40}$/.test(run.head_sha || ""),
  "A successful Android APK main workflow from this repository is required.");
  let merged = false;
  try { execFileSync("git", ["merge-base", "--is-ancestor", run.head_sha, "origin/main"], { stdio: "ignore" }); merged = true; } catch { /* Reject source outside main. */ }
  requireValue(merged, "Android source must already be merged into main.");
  const jobs = completeList(`actions/runs/${runId}/jobs?per_page=100&filter=latest`, "jobs");
  requireValue(["apk", "Android 33 emulator", "Android 36 emulator"].every(name => {
    const matches = jobs.filter(job => job.name === name);
    return matches.length === 1 && matches[0].status === "completed" && matches[0].conclusion === "success"
      && matches[0].run_id === run.id && matches[0].head_sha === run.head_sha;
  }), "APK and both required emulator jobs must pass for this exact run before publication.");
  const artifacts = completeList(`actions/runs/${runId}/artifacts?per_page=100`, "artifacts");
  const matches = artifacts.filter(artifact => artifact.name === `haykasa-android-debug-${run.head_sha}` && artifact.expired === false);
  requireValue(matches.length === 1, "Exactly one unexpired Android debug artifact is required.");
  const artifact = matches[0];
  requireValue(Number.isSafeInteger(artifact.id) && artifact.id > 0 && Number.isSafeInteger(artifact.size_in_bytes)
    && artifact.size_in_bytes > 0 && artifact.size_in_bytes < maximum && /^sha256:[a-f0-9]{64}$/.test(artifact.digest || "")
    && artifact.workflow_run?.id === run.id && artifact.workflow_run.head_sha === run.head_sha
    && artifact.workflow_run.head_branch === "main", "Artifact provenance, digest or size is invalid.");
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
  const tag = `${ANDROID_PREVIEW_TAG_PREFIX}${run.head_sha}`;
  const existing = api(`releases/tags/${tag}`, true);
  const existingTag = tagCommit(tag);
  if (existing) {
    const download = androidDownloadFromRelease(existing);
    requireValue(existingTag === run.head_sha && download?.buildCommit === run.head_sha
      && download.sha256 === digest && download.sizeBytes === apk.length,
    "A different or incomplete preview already exists; immutable releases are never replaced.");
    console.log("Verified existing Android preview; no release was replaced.");
    return;
  }
  requireValue(existingTag === null, "A preview tag already exists without a complete release; it will not be moved or replaced.");
  const metadata = { schemaVersion: 1, sourceSha: run.head_sha, workflowRunId: run.id, artifactId: artifact.id,
    artifactSha256: artifact.digest.slice(7), apkSha256: digest, apkSizeBytes: apk.length,
    sourceCommittedAt: timestamp(execFileSync("git", ["show", "-s", "--format=%cI", run.head_sha], { encoding: "utf8" }).trim()),
    buildCreatedAt: timestamp(run.created_at), androidApis: [33, 36] };
  const notes = `Download **${apkName}** below and open it on Android 6.0+. No ZIP extraction or GitHub account is needed.\n\nPreview build **${run.head_sha.slice(0, 7)}**, created ${metadata.buildCreatedAt}. APK and Android 13/API33 + Android 16/API36 emulator checks passed.\n\nSamsung Auto Blocker may prevent installation outside approved stores. You can use https://haykasa.vercel.app without an APK. Installation help: https://github.com/${repository}/blob/main/android/README.md#samsung-unknown-app-blocked .\n\nThis is a debug-signed **Android Preview**, not a Play Store or production-signed release. A preview built with another test key may require uninstalling the older preview first. These downloads do not provide automatic Android updates.\n\nThe app uses HayKasa's live mobile website. Embedded YouTube remains a foreground fallback; native source audio requires an available backend. Emulator checks do not prove live extraction or physical-device behavior.\n\nVerified build: https://github.com/${repository}/actions/runs/${runId} . Source commit: ${run.head_sha}, merged into main.\n\nAPK SHA-256: \`${digest}\`.\n\n<!-- ${ANDROID_PREVIEW_METADATA_MARKER} ${JSON.stringify(metadata)} -->\n`;
  fs.writeFileSync("android-preview-notes.md", notes);
  gh(["release", "create", tag, apkName, "--repo", repository, "--target", run.head_sha, "--prerelease", "--latest=false", "--title", `HayKasa Android Preview ${run.head_sha.slice(0, 7)}`, "--notes-file", "android-preview-notes.md"]);
  const published = api(`releases/tags/${tag}`);
  const download = androidDownloadFromRelease(published);
  requireValue(tagCommit(tag) === run.head_sha && download?.buildCommit === run.head_sha && download.workflowRunId === run.id
    && download.sha256 === digest && download.sizeBytes === apk.length, "Published APK metadata did not match the tested artifact.");
  console.log(`Published verified Android preview: https://github.com/${repository}/releases/download/${tag}/${apkName}`);
}
try { main(); } catch (error) {
  // Child-process stderr can contain temporary signed URLs. Keep failures terse.
  console.error(error instanceof PublicationError ? error.message : "Android preview publication failed.");
  process.exitCode = 1;
}
