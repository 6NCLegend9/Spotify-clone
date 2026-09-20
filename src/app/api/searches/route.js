import UserData from "@/models/UserData";
import { mutateDocument } from "@/utils/documentMutation.mjs";
import { removeSearchTerm } from "@/utils/recentActivity.mjs";
import { NextResponse } from "next/server";
import { apiError, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_SEARCHES = 30;
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function DELETE(request) {
  try {
    const { userData, email } = await getAuthenticatedAccount(request);
    const limit = await isRateLimited(`search-history:${email}`, { windowMs: 60_000, max: 60 });
    if (limit.limited) return apiError("RATE_LIMITED", { retryAfter: limit.retryAfter });
    const body = await readRequestJson(request);
    if (typeof body.term !== "string" || !body.term.trim() || body.term.length > 100) {
      return apiError("VALIDATION_ERROR", { message: "A valid search term is required" });
    }
    const updated = await mutateDocument(UserData, userData._id, (current) => ({ searches: removeSearchTerm(current.searches, body.term) }));
    return NextResponse.json({ success: true, data: updated.searches.slice(-10).reverse() }, { headers: NO_STORE });
  } catch (error) { return handleApiError(error, "delete recent search"); }
}

export async function GET(request) {
  try {
    const account = await getAuthenticatedAccount(request, { optional: true });
    const searches = Array.isArray(account?.userData?.searches) ? account.userData.searches : [];
    return NextResponse.json(
      { success: true, data: searches.slice(-10).reverse() },
      { headers: NO_STORE },
    );
  } catch (error) {
    return handleApiError(error, "get recent searches");
  }
}

// Records a search term so recommendations.js has a real signal for brand-new
// accounts that haven't played anything yet (previously this field was declared
// in the schema but never written to).
export async function POST(request) {
  try {
    const { userData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`search-history:${email}`, {
      windowMs: 60_000,
      max: 60,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many activity updates. Please slow down.",
      });
    }
    const body = await readRequestJson(request);
    const term = typeof body.term === "string" ? body.term.trim().slice(0, 100) : "";
    if (!term) {
      return apiError("VALIDATION_ERROR", { message: "A search term is required" });
    }

    if (userData.settings?.privateSession) {
      return NextResponse.json({
        success: true,
        message: "Private session enabled; search not recorded",
        data: userData.searches || [],
      }, { headers: NO_STORE });
    }
    const updated = await mutateDocument(UserData, userData._id, (current) => {
      if (current.settings?.privateSession) return null;
      return { searches: [...removeSearchTerm(current.searches, term), term].slice(-MAX_SEARCHES) };
    }, { "settings.privateSession": { $ne: true } });
    return NextResponse.json({ success: true, message: "Search recorded", data: updated.searches }, { headers: NO_STORE });
  } catch (e) {
    return handleApiError(e, "record search");
  }
}
