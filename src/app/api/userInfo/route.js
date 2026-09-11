import { NextResponse } from "next/server";
import { getSessionUser } from "@/utils/sessionAuth";
import { apiError, handleApiError } from "@/utils/apiResponse";

export const runtime = "nodejs";
export const maxDuration = 15;

// Get user info
export async function GET(req){
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return apiError("UNAUTHORIZED", { message: "Log in to view your profile." });
        }
        return NextResponse.json(
            {
                success: true,
                message: "User found",
                data: {
                    userName: user.userName,
                    email: user.email,
                    imageUrl: user.imageUrl,
                    isVerified: user.isVerified
                }
            },
            { headers: { "Cache-Control": "private, no-store" } },
        );
    } catch (e) {
        return handleApiError(e, "Load user profile");
    }
}