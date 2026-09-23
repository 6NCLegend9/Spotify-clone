import { desktopGithubReleaseFileUrl, desktopReleaseFileUrl } from "@/utils/desktopRelease.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, context) {
  const params = await context.params;
  const target = desktopReleaseFileUrl(
    process.env.HEYKASA_DESKTOP_BLOB_BASE_URL,
    params?.channel,
    params?.file,
  ) || desktopGithubReleaseFileUrl(params?.channel, params?.file);

  if (!target) {
    return new Response("Desktop update artifact not found.", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return Response.redirect(target, 307);
}
