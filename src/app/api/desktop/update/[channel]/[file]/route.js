import { DESKTOP_INSTALLER_PUBLIC_NAME } from "@/utils/desktopInstaller.mjs";
import {
  desktopGithubReleaseDownloadUrl,
  desktopReleaseBundle,
  fetchDesktopGithubRelease,
  isSafeDesktopReleaseFile,
  normalizeDesktopReleaseChannel,
} from "@/utils/desktopRelease.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return new Response("Desktop update artifact not found.", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(_request, context) {
  const params = await context.params;
  const channel = normalizeDesktopReleaseChannel(params?.channel);
  const file = String(params?.file || "").trim();
  if (!channel || !isSafeDesktopReleaseFile(file)) return notFound();

  try {
    const release = await fetchDesktopGithubRelease(channel);
    const bundle = desktopReleaseBundle(release, channel);
    if (!bundle) return notFound();

    if (file === DESKTOP_INSTALLER_PUBLIC_NAME) {
      return Response.redirect(bundle.installerUrl, 307);
    }
    if (!bundle.assetNames.has(file)) return notFound();

    const target = desktopGithubReleaseDownloadUrl(bundle.tag, file);
    return target ? Response.redirect(target, 307) : notFound();
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      msg: "desktop_update_release_lookup_failed",
      channel,
      error: error instanceof Error ? error.message : String(error),
    }));
    return notFound();
  }
}
