export const dynamic = "force-dynamic";

export async function GET() {
  const webVersion = process.env.VERCEL_GIT_COMMIT_SHA || process.env.HEYKASA_BUILD_ID || "development";
  return Response.json({
    webVersion,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
