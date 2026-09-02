import { NextResponse } from "next/server";
import { isRateLimited } from "@/utils/rateLimit";
import {
    apiError,
    handleApiError,
    readRequestJson,
} from "@/utils/apiResponse";
import { getAuthenticatedAccount } from "@/utils/userAccount";

export const runtime = "nodejs";
export const maxDuration = 15;

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_FAVOURITES = 500;

function favouritePayload(userData) {
    const json = typeof userData?.toJSON === "function" ? userData.toJSON() : userData;
    return {
        favourites: json.favourites || [],
        favouriteAddedAt: json.favouriteAddedAt || {},
    };
}

// Get user data
export async function GET(req){
    try {
        const { userData } = await getAuthenticatedAccount(req);
        return NextResponse.json(
            {
                success: true,
                message: "User Data found",
                data: favouritePayload(userData),
            }
        );

    } catch (e) {
        return handleApiError(e, "get favourites");
    }

}



// Add to favourites
export async function POST(request) {
    try {
        const { userData, email } = await getAuthenticatedAccount(request);
        const rateLimit = await isRateLimited(`favourite:${email}`, {
            windowMs: 60_000,
            max: 60,
        });
        if (rateLimit.limited) {
            return apiError("RATE_LIMITED", {
                retryAfter: rateLimit.retryAfter,
                message: "Too many favourite updates. Please slow down.",
            });
        }
        const { id } = await readRequestJson(request);
        if (typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id)) {
            return apiError("VALIDATION_ERROR", {
                message: "A valid YouTube track is required",
            });
        }
        const favourites = Array.isArray(userData.favourites) ? userData.favourites : [];
        if (favourites.includes(id)) {
            userData.favourites = favourites.filter((songId) => songId !== id);
            userData.favouriteAddedAt?.delete(id);
        } else {
            userData.favourites = [
                ...favourites,
                id,
            ].slice(-MAX_FAVOURITES);
            userData.favouriteAddedAt?.set(id, new Date());
            const retained = new Set(userData.favourites);
            for (const favouriteId of userData.favouriteAddedAt?.keys() || []) {
                if (!retained.has(favouriteId)) {
                    userData.favouriteAddedAt.delete(favouriteId);
                }
            }
        }
        await userData.save();
        return NextResponse.json(
            {
                success: true,
                message: "Favourites updated",
                data: favouritePayload(userData),
            }
        );

    } catch (e) {
        return handleApiError(e, "update favourites");
    }

}
