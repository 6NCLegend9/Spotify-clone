import { NextResponse } from "next/server";
import UserData from "@/models/UserData";
import { apiError, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import { mergeSeenNotificationIds, sanitizeNotificationIds } from "@/utils/accountNotifications.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request) {
  try {
    const { userData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`notifications-read:${email}`, {
      windowMs: 15 * 60_000,
      max: 60,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many notification updates. Please wait before trying again.",
      });
    }

    const body = await readRequestJson(request);
    const ids = sanitizeNotificationIds(body?.ids);
    if (ids.length === 0) {
      return NextResponse.json({ success: true, seenNotificationIds: userData.seenNotificationIds || [] });
    }

    const seenNotificationIds = mergeSeenNotificationIds(userData.seenNotificationIds, ids);
    await UserData.updateOne({ _id: userData._id }, { $set: { seenNotificationIds } });
    return NextResponse.json({ success: true, seenNotificationIds });
  } catch (error) {
    return handleApiError(error, "Mark notifications read");
  }
}
