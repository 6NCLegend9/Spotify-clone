import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import {
  DESKTOP_INSTALLER_PUBLIC_NAME,
  findLocalDesktopInstaller,
  hostedDesktopInstallerUrl,
} from "../../../../utils/desktopInstaller.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveHostedInstaller() {
  return hostedDesktopInstallerUrl(
    process.env.HEYKASA_DESKTOP_DOWNLOAD_URL,
    process.env.HEYKASA_DESKTOP_BLOB_BASE_URL,
  );
}

function localInstallerHeaders(local) {
  return {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${DESKTOP_INSTALLER_PUBLIC_NAME}"`,
    "Content-Length": String(local.sizeBytes),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function GET() {
  const local = findLocalDesktopInstaller();
  if (local) {
    return new Response(Readable.toWeb(createReadStream(local.filePath)), {
      headers: localInstallerHeaders(local),
    });
  }

  const hosted = resolveHostedInstaller();
  if (hosted) return Response.redirect(hosted, 302);
  return Response.json({
    title: "Installer unavailable",
    message: "The Windows installer has not been published to Vercel Blob yet.",
  }, { status: 404 });
}

export async function HEAD() {
  const local = findLocalDesktopInstaller();
  if (local) return new Response(null, { headers: localInstallerHeaders(local) });

  const hosted = resolveHostedInstaller();
  if (hosted) return Response.redirect(hosted, 302);
  return new Response(null, { status: 404 });
}
