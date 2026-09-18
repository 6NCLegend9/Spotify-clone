import { NextResponse } from "next/server";
import dbConnect from "@/utils/dbconnect";
import WeekPulse from "@/models/WeekPulse";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { apiError, handleApiError } from "@/utils/apiResponse";
import { publicPulseTracks, utcWeekKey } from "@/utils/weekPulse.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request) {
  try {
    const rateLimit = await isRateLimited(`week-on-kasa:${getClientKey(request)}`, {
      windowMs: 60_000,
      max: 30,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many requests. Please slow down and try again shortly.",
      });
    }

    await dbConnect();
    const weekKey = utcWeekKey();
    const pulse = await WeekPulse.findOne({ weekKey }).select("weekKey tracks").lean();
    const tracks = publicPulseTracks(pulse?.tracks);
    return NextResponse.json(
      { success: true, weekKey, tracks },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "read weekly pulse");
  }
}
