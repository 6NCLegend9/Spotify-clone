export const ANDROID_RELEASE_REPOSITORY = "6NCLegend9/Spotify-clone";
export const ANDROID_RELEASE_TAG = "android-preview";
export const ANDROID_APK_NAME = "HayKasa-Android.apk";
export const ANDROID_DOWNLOAD_PATH = "/api/android/download";
const releaseBase = `https://github.com/${ANDROID_RELEASE_REPOSITORY}/releases`;

export function androidDownloadFromRelease(release) {
  if (release?.draft !== false || release.prerelease !== true || release.tag_name !== ANDROID_RELEASE_TAG || !Array.isArray(release.assets)) return null;
  const matches = release.assets.filter(asset => asset?.name === ANDROID_APK_NAME);
  if (matches.length !== 1) return null;
  const asset = matches[0];
  const apkUrl = `${releaseBase}/download/${ANDROID_RELEASE_TAG}/${ANDROID_APK_NAME}`;
  if (asset.state !== "uploaded" || asset.browser_download_url !== apkUrl
    || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 100 * 1024 * 1024
    || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || "")) return null;
  return { apkUrl, downloadUrl: ANDROID_DOWNLOAD_PATH, sizeBytes: asset.size,
    sha256: asset.digest.slice(7), releaseNotesUrl: `${releaseBase}/tag/${ANDROID_RELEASE_TAG}`, preview: true, minimumAndroid: "6.0" };
}

export async function fetchAndroidDownload(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`https://api.github.com/repos/${ANDROID_RELEASE_REPOSITORY}/releases/tags/${ANDROID_RELEASE_TAG}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "HayKasa-Android-Download" },
    next: { revalidate: 300 }, signal: AbortSignal.timeout(8000), redirect: "error",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Android release information is unavailable.");
  return androidDownloadFromRelease(await response.json());
}
