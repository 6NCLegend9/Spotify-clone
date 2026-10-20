export const ANDROID_RELEASE_REPOSITORY = "6NCLegend9/Spotify-clone";
export const ANDROID_RELEASE_TAG = "android-preview";
export const ANDROID_PREVIEW_TAG_PREFIX = "android-preview-";
export const ANDROID_PREVIEW_METADATA_MARKER = "haykasa-android-preview:v1";
export const ANDROID_APK_NAME = "HayKasa-Android.apk";
export const ANDROID_DOWNLOAD_PATH = "/api/android/download";
const releaseBase = `https://github.com/${ANDROID_RELEASE_REPOSITORY}/releases`;
const isoDate = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;

function previewMetadata(release, sourceSha, asset) {
  if (typeof release.body !== "string" || release.body.length > 20000) return null;
  const entries = [...release.body.matchAll(/<!-- haykasa-android-preview:v1 (\{[^\r\n]*\}) -->/g)];
  if (entries.length !== 1) return null;
  try {
    const value = JSON.parse(entries[0][1]);
    if (value.schemaVersion !== 1 || value.sourceSha !== sourceSha
      || !Number.isSafeInteger(value.workflowRunId) || value.workflowRunId <= 0
      || !Number.isSafeInteger(value.artifactId) || value.artifactId <= 0
      || !/^[a-f0-9]{64}$/.test(value.artifactSha256 || "")
      || value.apkSha256 !== asset.digest.slice(7) || value.apkSizeBytes !== asset.size
      || !isoDate(value.sourceCommittedAt) || !isoDate(value.buildCreatedAt)
      || JSON.stringify(value.androidApis) !== "[33,36]") return null;
    return value;
  } catch { return null; }
}

export function androidDownloadFromRelease(release) {
  if (release?.draft !== false || release.prerelease !== true || !Array.isArray(release.assets)) return null;
  const legacy = release.tag_name === ANDROID_RELEASE_TAG;
  const sourceSha = typeof release.tag_name === "string" ? /^android-preview-([a-f0-9]{40})$/.exec(release.tag_name)?.[1] : null;
  if (!legacy && (!sourceSha || release.target_commitish !== sourceSha || release.author?.login !== "github-actions[bot]")) return null;
  const matches = release.assets.filter(asset => asset?.name === ANDROID_APK_NAME);
  if (matches.length !== 1) return null;
  const asset = matches[0];
  const apkUrl = `${releaseBase}/download/${release.tag_name}/${ANDROID_APK_NAME}`;
  if (asset.state !== "uploaded" || asset.browser_download_url !== apkUrl
    || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 100 * 1024 * 1024
    || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || "")) return null;
  const metadata = !legacy ? previewMetadata(release, sourceSha, asset) : null;
  if (!legacy && !metadata) return null;
  return { apkUrl, downloadUrl: ANDROID_DOWNLOAD_PATH, sizeBytes: asset.size,
    sha256: asset.digest.slice(7), releaseNotesUrl: `${releaseBase}/tag/${release.tag_name}`, preview: true, minimumAndroid: "6.0", legacy,
    ...(metadata ? { buildCommit: metadata.sourceSha, buildDate: metadata.buildCreatedAt, sourceCommittedAt: metadata.sourceCommittedAt, workflowRunId: metadata.workflowRunId } : {}) };
}

export async function fetchAndroidDownload(fetchImpl = globalThis.fetch) {
  const options = { headers: { accept: "application/vnd.github+json", "user-agent": "HayKasa-Android-Download" },
    next: { revalidate: 300 }, signal: AbortSignal.timeout(8000), redirect: "error" };
  // Bound API work and accept only canonical repository URLs from validated releases.
  const response = await fetchImpl(`https://api.github.com/repos/${ANDROID_RELEASE_REPOSITORY}/releases?per_page=100&page=1`, options);
  if (response.status !== 404 && !response.ok) throw new Error("Android release information is unavailable.");
  const releases = response.status === 404 ? [] : await response.json();
  if (!Array.isArray(releases) || releases.length > 100) throw new Error("Invalid Android release information.");
  const valid = releases.map(androidDownloadFromRelease).filter(Boolean);
  const previews = valid.filter(release => !release.legacy).sort((left, right) =>
    right.sourceCommittedAt.localeCompare(left.sourceCommittedAt)
    || right.buildDate.localeCompare(left.buildDate) || right.workflowRunId - left.workflowRunId);
  if (previews.length) return previews[0];
  const legacy = valid.find(release => release.legacy);
  if (legacy) return legacy;
  const fallback = await fetchImpl(`https://api.github.com/repos/${ANDROID_RELEASE_REPOSITORY}/releases/tags/${ANDROID_RELEASE_TAG}`, options);
  if (fallback.status === 404) return null;
  if (!fallback.ok) throw new Error("Android release information is unavailable.");
  const download = androidDownloadFromRelease(await fallback.json());
  return download?.legacy ? download : null;
}
