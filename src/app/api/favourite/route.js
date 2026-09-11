import { NextResponse } from "next/server";
import { isRateLimited } from "@/utils/rateLimit";
import {
    apiError,
    handleApiError,
    readRequestJson,
} from "@/utils/apiResponse";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import UserData from "@/models/UserData";
import { boundedMembership, dateMapForMembers, mutateDocument } from "@/utils/documentMutation.mjs";

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
        const { id, liked } = await readRequestJson(request);
        if (liked !== undefined && typeof liked !== "boolean") return apiError("VALIDATION_ERROR");
        if (typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id)) {
            return apiError("VALIDATION_ERROR", {
                message: "A valid YouTube track is required",
            });
        }
        const updated = await mutateDocument(UserData, userData._id, (current) => {
            const enabled = liked ?? !(current.favourites || []).includes(id);
            const favourites = boundedMembership(current.favourites, id, enabled, MAX_FAVOURITES);
            return { favourites, favouriteAddedAt: dateMapForMembers(favourites, current.favouriteAddedAt, enabled ? id : null) };
        });
        return NextResponse.json(
            {
                success: true,
                message: "Favourites updated",
                data: favouritePayload(updated),
            }
        );

    } catch (e) {
        return handleApiError(e, "update favourites");
    }

}
