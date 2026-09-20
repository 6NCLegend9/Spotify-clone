import { NextResponse } from "next/server";
import { apiError, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_SEARCHES = 30;

export async function GET(request) {
  try {
    const account = await getAuthenticatedAccount(request, { optional: true });
    const searches = Array.isArray(account?.userData?.searches) ? account.userData.searches : [];
    return NextResponse.json(
      { success: true, data: searches.slice(-10).reverse() },
      { headers: { "Cache-Control": "private, no-store" } },
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
      });
    }
    const existing = Array.isArray(userData.searches) ? userData.searches : [];
    const deduped = existing.filter((value) => value.toLowerCase() !== term.toLowerCase());
    userData.searches = [...deduped, term].slice(-MAX_SEARCHES);
    await userData.save();
    return NextResponse.json({ success: true, message: "Search recorded", data: userData.searches });
  } catch (e) {
    return handleApiError(e, "record search");
  }
}

export async function DELETE(request) {
  try {
    const { userData } = await getAuthenticatedAccount(request);
    const body = await readRequestJson(request).catch(() => ({}));
    const term = typeof body?.term === "string" ? body.term.trim() : "";
    const existing = Array.isArray(userData.searches) ? userData.searches : [];
    userData.searches = term ? existing.filter((value) => value.toLowerCase() !== term.toLowerCase()) : [];
    await userData.save();
    return NextResponse.json({ success: true, message: term ? "Search removed" : "Search history cleared", data: userData.searches });
  } catch (e) {
    return handleApiError(e, "delete recent search");
  }
}
