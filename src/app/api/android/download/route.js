import { fetchAndroidDownload } from "../../../../utils/androidDownload.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

async function download(head = false) {
  try {
    const release = await fetchAndroidDownload();
    if (release) return new Response(null, { status: 302, headers: { ...headers, Location: release.apkUrl } });
    return head ? new Response(null, { status: 404, headers }) : Response.json({ message: "The Android APK is not available right now. Please try again later." }, { status: 404, headers });
  } catch {
    return head ? new Response(null, { status: 503, headers }) : Response.json({ message: "The Android download is temporarily unavailable. Please try again." }, { status: 503, headers });
  }
}
export async function GET() { return download(); }
export async function HEAD() { return download(true); }
