import { NextResponse } from "next/server";
import dbConnect from "@/utils/dbconnect";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import UserData from "@/models/UserData";
import crypto from "crypto";
import mailSender from "@/utils/mailSender";
import { getVerificationEmailTemplate } from "@/emails/VerificationEmail";
import { getAppUrl } from "@/utils/appUrl";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";

export const runtime = "nodejs";

export async function POST(request) {
    if (isRateLimited(getClientKey(request), { windowMs: 15 * 60_000, max: 8 })) {
        return NextResponse.json(
            { success: false, message: "Too many signup attempts. Please try again later.", data: null },
            { status: 429 },
        );
    }

    const payload = await request.json().catch(() => null);
    const userName = typeof payload?.userName === "string" ? payload.userName.trim().slice(0, 50) : "";
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!userName) {
        return NextResponse.json(
            { success: false, title: "Name required", message: "Please enter a username.", data: null },
            { status: 400 },
        );
    }
    if (!emailPattern.test(email)) {
        return NextResponse.json(
            { success: false, title: "Invalid email", message: "Please enter a valid email address.", data: null },
            { status: 400 },
        );
    }
    if (password.length < 8 || password.length > 72) {
        return NextResponse.json(
            { success: false, title: "Password too short", message: "Use a password between 8 and 72 characters.", data: null },
            { status: 400 },
        );
    }

    let userData = null;
    let createdUser = null;
    try {
        await dbConnect();

        const existingUser = await User.findOne({ email }).select("_id").lean();
        if (existingUser) {
            return NextResponse.json(
                {
                    success: false,
                    title: "Account already exists",
                    message: "An account with that email already exists. Try logging in, or request a new password link.",
                    data: null,
                },
                { status: 409 },
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        userData = await UserData.create({});
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationTokenHash = crypto
            .createHash("sha256")
            .update(verificationToken)
            .digest("hex");

        const result = await User.create({
            userName,
            email,
            password: hashedPassword,
            imageUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(userName)}`,
            userData: userData._id,
            verificationToken: verificationTokenHash,
            verificationTokenExpires: Date.now() + 60 * 60_000,
        });
        createdUser = result;

        const url = `${getAppUrl(request)}/verify-email/${verificationToken}`;
        const title = "Welcome to HeyKasa! Verify Your Email";
        const body = getVerificationEmailTemplate(userName, url);

        try {
            await mailSender(email, title, body, { inlineLogo: true });
        } catch (mailError) {
            await Promise.allSettled([
                User.deleteOne({ _id: result._id }),
                UserData.deleteOne({ _id: userData._id }),
            ]);
            console.error("Signup email delivery failed:", mailError);
            return NextResponse.json(
                {
                    success: false,
                    message: "We could not send the verification email. Please try again.",
                    data: null,
                },
                { status: 502 },
            );
        }

        return NextResponse.json(
            {
                success: true,
                message: "User created successfully. Please check your email to verify your account.",
                data: {
                    userName: result.userName,
                    email: result.email,
                },
            },
            { status: 201 },
        );
    } catch (error) {
        console.error("Signup error:", error);
        await Promise.allSettled([
            createdUser?._id
                ? User.deleteOne({ _id: createdUser._id })
                : Promise.resolve(),
            userData?._id
                ? UserData.deleteOne({ _id: userData._id })
                : Promise.resolve(),
        ]);
        if (error?.code === 11000) {
            return NextResponse.json(
                { success: false, title: "Account already exists", message: "An account with that email already exists. Try logging in.", data: null },
                { status: 409 },
            );
        }
        return NextResponse.json(
            { success: false, message: "Something went wrong", data: null },
            { status: 500 },
        );
    }
}
