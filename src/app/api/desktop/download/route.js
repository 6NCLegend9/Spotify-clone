import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import {
  DESKTOP_INSTALLER_PUBLIC_NAME,
  findLocalDesktopInstaller,
  hostedDesktopInstallerUrl,
} from "../../../../utils/desktopInstaller.mjs";
import {
  desktopReleaseBundle,
  fetchDesktopGithubRelease,
} from "../../../../utils/desktopRelease.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localInstallerHeaders(local) {
  return {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${DESKTOP_INSTALLER_PUBLIC_NAME}"`,
    "Content-Length": String(local.sizeBytes),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

async function hostedInstaller() {
  const configured = hostedDesktopInstallerUrl(process.env.HEYKASA_DESKTOP_DOWNLOAD_URL);
  if (configured) return configured;
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
  const local = findLocalDesktopInstaller();
  if (local) {
    return new Response(Readable.toWeb(createReadStream(local.filePath)), {
      headers: localInstallerHeaders(local),
    });
  }

  const hosted = await hostedInstaller();
  if (hosted) return Response.redirect(hosted, 302);
  return Response.json({
    title: "Installer unavailable",
    message: "The signed Windows installer has not been published to GitHub Releases yet.",
  }, { status: 404 });
}

export async function HEAD() {
  const local = findLocalDesktopInstaller();
  if (local) return new Response(null, { headers: localInstallerHeaders(local) });

  const hosted = await hostedInstaller();
  if (hosted) return Response.redirect(hosted, 302);
  return new Response(null, { status: 404 });
}
