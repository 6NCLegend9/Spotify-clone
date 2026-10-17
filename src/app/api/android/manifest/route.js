import { fetchAndroidDownload } from "../../../../utils/androidDownload.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    const release = await fetchAndroidDownload();
    if (!release) return Response.json({ available: false }, { headers });
    const { apkUrl: _apkUrl, ...download } = release;
    return Response.json({ available: true, ...download }, { headers });
  } catch {
    return Response.json({ available: false, message: "Android download information is temporarily unavailable." }, { status: 503, headers });
  }
}
