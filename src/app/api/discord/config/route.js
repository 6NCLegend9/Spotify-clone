import { NextResponse } from "next/server";
import { isDiscordPresenceConfigured } from "@/utils/discordOAuth.mjs";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET() {
  return NextResponse.json(
    { configured: isDiscordPresenceConfigured() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
