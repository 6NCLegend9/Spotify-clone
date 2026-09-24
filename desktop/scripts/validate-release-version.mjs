import { compareReleaseVersions } from "../src/version.mjs";

const CHANNELS = new Set(["stable", "beta"]);

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function releaseVersion(name) {
  const value = required(name);
  if (compareReleaseVersions(value, value) !== 0) {
    throw new Error(`${name} must be a semantic version.`);
  }
  return value;
}

const channel = required("HEYKASA_DESKTOP_RELEASE_CHANNEL").toLowerCase();
if (!CHANNELS.has(channel)) {
  throw new Error("Release version preflight is only valid for beta or stable channels.");
}

const requested = releaseVersion("HEYKASA_DESKTOP_REQUESTED_VERSION");
const minimum = releaseVersion("HEYKASA_DESKTOP_MINIMUM_VERSION");
if (channel === "stable" && requested.includes("-")) {
  throw new Error("Stable desktop releases cannot use prerelease versions.");
}
if (compareReleaseVersions(minimum, requested) > 0) {
  throw new Error(`Minimum supported version ${minimum} cannot be newer than release ${requested}.`);
}

const manifestBase = String(
  process.env.HEYKASA_DESKTOP_CURRENT_MANIFEST_URL || "https://haykasa.vercel.app/api/desktop/manifest",
).trim();
const manifestUrl = new URL(manifestBase);
manifestUrl.searchParams.set("channel", channel);

const response = await fetch(manifestUrl, {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) {
  throw new Error(`Current desktop manifest returned HTTP ${response.status}.`);
}
const manifest = await response.json();
const current = String(manifest?.latest || "").trim();
if (current && compareReleaseVersions(current, current) === 0) {
  const comparison = compareReleaseVersions(requested, current);
  if (comparison <= 0) {
    throw new Error(`Requested desktop version ${requested} must be newer than currently published ${current}.`);
  }
}

console.log(JSON.stringify({
  event: "desktop_release_version_validated",
  channel,
  requested,
  minimum,
  current: current || null,
}));
