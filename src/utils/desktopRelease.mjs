export const DESKTOP_RELEASE_REPOSITORY = "6NCLegend9/Spotify-clone";
export const DESKTOP_RELEASES_API_URL = `https://api.github.com/repos/${DESKTOP_RELEASE_REPOSITORY}/releases?per_page=30`;

const CHANNELS = new Set(["stable", "beta", "internal"]);
const RELEASE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const INSTALLER = /^HayKasa-Setup-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)-x64\.exe$/i;

export function normalizeDesktopReleaseChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  return CHANNELS.has(channel) ? channel : "";
}

export function isSafeDesktopReleaseFile(value) {
  return RELEASE_FILE.test(String(value || "").trim());
}

export function desktopReleaseTag(channelValue, versionValue = "") {
  const channel = normalizeDesktopReleaseChannel(channelValue);
  const version = String(versionValue || "").trim();
  if (!channel) return "";
  if (!SEMVER.test(version)) return "";
  if (channel === "stable" && version.includes("-")) return "";
  if (channel === "stable") return `desktop-v${version}`;
  if (channel === "beta") return `desktop-beta-v${version}`;
  return `desktop-internal-v${version}`;
}

export function desktopReleaseVersionFromTag(tagValue, channelValue) {
  const tag = String(tagValue || "").trim();
  const channel = normalizeDesktopReleaseChannel(channelValue);
  if (!channel) return "";
  const prefix = channel === "stable"
    ? "desktop-v"
    : channel === "beta"
      ? "desktop-beta-v"
      : "desktop-internal-v";
  if (!tag.startsWith(prefix)) return "";
  const version = tag.slice(prefix.length);
  if (!SEMVER.test(version)) return "";
  if (channel === "stable" && version.includes("-")) return "";
  return version;
}

export function desktopGithubReleaseDownloadUrl(tagValue, fileValue) {
  const tag = String(tagValue || "").trim();
  const file = String(fileValue || "").trim();
  if (!tag || !isSafeDesktopReleaseFile(file)) return "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(tag)) return "";
  return `https://github.com/${DESKTOP_RELEASE_REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`;
}

export function selectDesktopGithubRelease(releases, channelValue) {
  const channel = normalizeDesktopReleaseChannel(channelValue);
  if (!channel || !Array.isArray(releases)) return null;
  for (const release of releases) {
    if (!release || release.draft === true) continue;
    const tag = String(release.tag_name || "").trim();
    const version = desktopReleaseVersionFromTag(tag, channel);
    if (!version) continue;
    if (channel === "stable" && release.prerelease !== true) return release;
    if (channel !== "stable" && release.prerelease === true) return release;
  }
  return null;
}

export function desktopReleaseBundle(release, channelValue) {
  const channel = normalizeDesktopReleaseChannel(channelValue);
  if (!channel || !release || release.draft === true || !Array.isArray(release.assets)) return null;

  const tag = String(release.tag_name || "").trim();
  const tagVersion = desktopReleaseVersionFromTag(tag, channel);
  if (!tagVersion) return null;
  if (channel === "stable" && release.prerelease === true) return null;
  if (channel !== "stable" && release.prerelease !== true) return null;

  const names = new Set(
    release.assets
      .map((asset) => String(asset?.name || "").trim())
      .filter((name) => isSafeDesktopReleaseFile(name)),
  );
  if (!names.has("latest.yml") || !names.has("release-manifest.json")) return null;

  const installers = [...names]
    .map((name) => ({ name, match: name.match(INSTALLER) }))
    .filter((entry) => entry.match);
  if (installers.length !== 1) return null;

  const installerFile = installers[0].name;
  const version = installers[0].match[1];
  if (tagVersion !== version) return null;
  const blockmapFile = `${installerFile}.blockmap`;
  if (!names.has(blockmapFile)) return null;

  return {
    channel,
    tag,
    version,
    installerFile,
    blockmapFile,
    metadataFile: "latest.yml",
    manifestFile: "release-manifest.json",
    installerUrl: desktopGithubReleaseDownloadUrl(tag, installerFile),
    publishedAt: typeof release.published_at === "string" ? release.published_at : "",
    assetNames: names,
  };
}

export async function fetchDesktopGithubRelease(channelValue, fetchImpl = globalThis.fetch) {
  const channel = normalizeDesktopReleaseChannel(channelValue);
  if (!channel || typeof fetchImpl !== "function") return null;
  const response = await fetchImpl(DESKTOP_RELEASES_API_URL, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "HayKasa-Desktop-Updater",
    },
    next: { revalidate: 300 },
  });
  if (!response?.ok) throw new Error(`GitHub desktop releases returned ${response?.status || "an error"}.`);
  const releases = await response.json();
  return selectDesktopGithubRelease(releases, channel);
}
