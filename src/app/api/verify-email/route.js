import { NextResponse } from "next/server";
import dbConnect from "@/utils/dbconnect";
import User from "@/models/User";

export async function POST(request) {
    try {
        const { token } = await request.json();

        if (!token) {
            return NextResponse.json({ success: false, message: "Token is required" }, { status: 400 });
        }

        await dbConnect();

        // Find the user by the verification token and ensure it hasn't expired
        const user = await User.findOne({
            verificationToken: token,
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
