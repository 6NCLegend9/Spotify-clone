import { NextResponse } from "next/server";
import dbConnect from "@/utils/dbconnect";
import User from "@/models/User";
import crypto from "crypto";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";

export const runtime = "nodejs";

export async function POST(request) {
    if (isRateLimited(getClientKey(request), { windowMs: 15 * 60_000, max: 20 })) {
        return NextResponse.json(
            { success: false, message: "Too many verification attempts. Please try again later." },
            { status: 429 },
        );
    }

    try {
        const payload = await request.json().catch(() => null);
        const token = typeof payload?.token === "string" ? payload.token.trim() : "";

        if (!/^[a-f0-9]{40,128}$/i.test(token)) {
            return NextResponse.json({ success: false, message: "Token is required" }, { status: 400 });
        }

        await dbConnect();
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        // Find the user by the verification token and ensure it hasn't expired
        const user = await User.findOne({
            verificationToken: { $in: [token, tokenHash] },
            verificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return NextResponse.json(
                { success: false, message: "Invalid or expired verification token" },
                { status: 400 }
            );
        }

        // Update the user to verified
        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpires = null;
        await user.save();

        return NextResponse.json({ success: true, message: "Email verified successfully" });
    } catch (error) {
        console.error("Email verification error:", error);
        return NextResponse.json(
            { success: false, message: "An error occurred during verification" },
            { status: 500 }
        );
    }
}
