import { NextResponse } from "next/server";
import { handleApiError } from "@/utils/apiResponse";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import { loadFollowedReleases } from "@/utils/followedReleases.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request) {
  try {
    const { userData } = await getAuthenticatedAccount(request);
    const releases = await loadFollowedReleases(userData);
    return NextResponse.json(
      { releases },
      {
        headers: {
          "Cache-Control": "private, max-age=900",
        },
      },
    );
  } catch (e) {
    return handleApiError(e, "followed artist releases");
  }
}
