import {
  desktopReleaseBundle,
  fetchDesktopGithubRelease,
} from "../../../../utils/desktopRelease.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signedStableInstaller() {
  try {
    const release = await fetchDesktopGithubRelease("stable");
    return desktopReleaseBundle(release, "stable")?.installerUrl || "";
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      msg: "desktop_download_release_lookup_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return "";
  }
}

export async function GET() {
  const installer = await signedStableInstaller();
  if (installer) return Response.redirect(installer, 302);

  return Response.json({
    title: "Installer unavailable",
    message: "A signed HayKasa Windows installer has not been published yet.",
  }, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function HEAD() {
  const installer = await signedStableInstaller();
  if (installer) return Response.redirect(installer, 302);
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
