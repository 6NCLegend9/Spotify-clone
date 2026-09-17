import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET() {
  return NextResponse.json(
    { configured: true, transport: "desktop-bridge" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
