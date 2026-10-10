import { fetchManualDesktopDownload } from "../../../../utils/desktopManualDownload.mjs";
import { fetchVerifiedDesktopGithubRelease } from "../../../../utils/desktopReleaseTrust.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function availableInstaller() {
  try {
    const verified = await fetchVerifiedDesktopGithubRelease("stable");
    if (verified?.bundle?.installerUrl) return verified.bundle.installerUrl;
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      msg: "desktop_download_release_lookup_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  try {
    const manual = await fetchManualDesktopDownload();
    return manual?.installerUrl || "";
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "desktop_manual_download_lookup_failed",
      error: error instanceof Error ? error.message : String(error) }));
    return "";
  }
}

export async function GET() {
  const installer = await availableInstaller();
  if (installer) return new Response(null, { status: 302, headers: { Location: installer, "Cache-Control": "no-store" } });

  return Response.json({
    title: "Installer unavailable",
    message: "No HayKasa Windows installer is available. Please try again later.",
  }, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function HEAD() {
  const installer = await availableInstaller();
  if (installer) return new Response(null, { status: 302, headers: { Location: installer, "Cache-Control": "no-store" } });
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
