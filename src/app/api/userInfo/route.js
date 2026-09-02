import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import dbConnect from "@/utils/dbconnect";
import { tokenOptions } from "@/utils/authToken";
import { apiError, handleApiError } from "@/utils/apiResponse";

export const runtime = "nodejs";
export const maxDuration = 15;

// Get user info
export async function GET(req){
    try {
        const token = await getToken(tokenOptions(req));
        if (!token?.email) {
            return apiError("UNAUTHORIZED", { message: "Log in to view your profile." });
        }
        await dbConnect();
        const user = await User.findOne({ email: token.email })
            .select("userName email imageUrl isVerified")
            .lean();
        if (!user) {
            return apiError("NOT_FOUND", { message: "Your profile is no longer available." });
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
            }
        );
    } catch (e) {
        return handleApiError(e, "Load user profile");
    }
}