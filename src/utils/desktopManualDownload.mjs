import { DESKTOP_INSTALLER_APP_PATH, DESKTOP_INSTALLER_PUBLIC_NAME } from "./desktopInstaller.mjs";
import { DESKTOP_RELEASE_REPOSITORY, desktopGithubReleaseDownloadUrl } from "./desktopRelease.mjs";

// Preserve the published installer during the signed-release migration. Pin
// its identity so a replaced legacy asset cannot silently become the fallback.
const LEGACY_TAG = "desktop-latest";
const LEGACY_SIZE = 110799796;
const LEGACY_DIGEST = "sha256:5f163cdf097b30ecc5a83e48602ed301890f8df66f04751dae034f90e7c9f36b";

export async function fetchManualDesktopDownload(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`https://api.github.com/repos/${DESKTOP_RELEASE_REPOSITORY}/releases/tags/${LEGACY_TAG}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "HayKasa-Desktop-Download" },
    next: { revalidate: 300 },
  });
  if (!response?.ok) return null;
  const release = await response.json();
  if (release?.draft !== false || release.tag_name !== LEGACY_TAG || !Array.isArray(release.assets)) return null;
  const installerUrl = desktopGithubReleaseDownloadUrl(LEGACY_TAG, DESKTOP_INSTALLER_PUBLIC_NAME);
  const asset = release.assets.find(item => item?.name === DESKTOP_INSTALLER_PUBLIC_NAME);
  if (asset?.state !== "uploaded" || asset.size !== LEGACY_SIZE || asset.digest !== LEGACY_DIGEST
    || asset.browser_download_url !== installerUrl) return null;
  return {
    downloadUrl: DESKTOP_INSTALLER_APP_PATH,
    installerUrl,
    sizeBytes: asset.size,
    sha256: LEGACY_DIGEST.slice("sha256:".length),
    releaseNotesUrl: `https://github.com/${DESKTOP_RELEASE_REPOSITORY}/releases/tag/${LEGACY_TAG}`,
    source: "github-legacy",
    signatureVerified: false,
  };
}
