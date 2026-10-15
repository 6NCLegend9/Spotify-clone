import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { compareReleaseVersions } from "../src/version.mjs";
import { desktopReleaseTag } from "../../src/utils/desktopRelease.mjs";

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
function version(value, label, stable = false) {
  const text = String(value || "").trim();
  if (!VERSION.test(text) || (stable && text.includes("-"))) throw new Error(`Invalid ${label}.`);
  if (text.split("-")[0].split(".").some(part => Number(part) > 65535)) throw new Error(`${label} exceeds Windows version limits.`);
  return text;
}
function nextPatch(value) {
  const parts = value.split(".").map(Number);
  for (let i = 2; i >= 0; i--) {
    if (parts[i] < 65535) { parts[i]++; return parts.join("."); }
    parts[i] = 0;
  }
  throw new Error("No newer Windows version is available.");
}

export function resolveReleaseMetadata({ eventName, ref, repository, sha, packageVersion, tags = [], currentManifest, inputs = {} }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "")) throw new Error("Invalid release repository.");
  if (!/^[a-f0-9]{40,64}$/i.test(sha || "")) throw new Error("Invalid release commit.");
  const automatic = eventName === "push";
  if (!automatic && eventName !== "workflow_dispatch") throw new Error("Unsupported release event.");
  const channel = automatic ? "stable" : inputs.channel;
  if (!["stable", "beta", "internal"].includes(channel)) throw new Error("Invalid release channel.");
  if ((automatic || channel === "stable") && ref !== "refs/heads/main") throw new Error("Stable releases must use main.");

  let requested, minimum;
  if (automatic) {
    if (currentManifest?.channel !== "stable") throw new Error("Current stable manifest is unavailable or has the wrong channel.");
    const latest = version(currentManifest.latest, "published stable version", true);
    minimum = version(currentManifest.minimum, "minimum supported version", true);
    if (compareReleaseVersions(minimum, latest) > 0) throw new Error("Current minimum exceeds the published version.");
    const candidates = [version(packageVersion, "package version", true), latest];
    for (const tag of tags) {
      const match = String(tag).match(/^desktop-v(\d+\.\d+\.\d+)$/);
      if (match) candidates.push(version(match[1], "stable tag", true));
    }
    candidates.sort(compareReleaseVersions);
    requested = nextPatch(candidates.at(-1));
  } else {
    requested = version(inputs.version, "requested version", channel === "stable");
    minimum = version(inputs.minimum_version || "1.0.0", "minimum supported version");
    if (compareReleaseVersions(minimum, requested) > 0) throw new Error("Minimum supported version exceeds the requested version.");
  }
  const tag = desktopReleaseTag(channel, requested);
  const notes = automatic ? `https://github.com/${repository}/releases/tag/${tag}` : String(inputs.release_notes_url || "").trim();
  if (channel === "stable" && !notes) throw new Error("Stable releases require release notes.");
  if (notes) {
    const url = new URL(notes);
    if (url.protocol !== "https:" || url.username || url.password || /[\r\n]/.test(notes)) throw new Error("Release notes must be an HTTPS URL without credentials.");
  }
  return { channel, version: requested, minimum_version: minimum, release_notes_url: notes, tag };
}

async function main() {
  const automatic = process.env.GITHUB_EVENT_NAME === "push";
  let currentManifest, tags = [];
  if (automatic) {
    const response = await fetch("https://haykasa.vercel.app/api/desktop/manifest?channel=stable", {
      headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Current stable manifest returned HTTP ${response.status}.`);
    currentManifest = await response.json();
    tags = execFileSync("git", ["tag", "--list", "desktop-v*"], { encoding: "utf8" }).trim().split("\n");
  }
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const resolved = resolveReleaseMetadata({
    eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF,
    repository: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA,
    packageVersion: pkg.version, currentManifest, tags,
    inputs: JSON.parse(process.env.DESKTOP_RELEASE_INPUTS || "{}"),
  });
  if (!process.env.GITHUB_OUTPUT) throw new Error("GitHub Actions output file is required.");
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(resolved).map(([key, value]) => `${key}=${value}\n`).join(""));
  console.log(JSON.stringify({ event: "desktop_release_resolved", commit: process.env.GITHUB_SHA, ...resolved }));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
