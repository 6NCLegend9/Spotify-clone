import dbConnect from "@/utils/dbconnect";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import UserData from "@/models/UserData";
import crypto from "crypto";
import mailSender from "@/utils/mailSender";
import { getVerificationEmailTemplate } from "@/emails/VerificationEmail";
import { getAppLink, getPublicAssetUrl } from "@/utils/appUrl";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import {
    apiError,
    apiSuccess,
    handleApiError,
    readRequestJson,
} from "@/utils/apiResponse";
import {
    normalizeEmail,
    validateEmail,
    validatePassword,
} from "@/utils/authErrors";
import { hashToken } from "@/utils/tokenHash.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
    let userData = null;
    let createdUser = null;

    try {
        const rateLimit = await isRateLimited(getClientKey(request), {
            windowMs: 15 * 60_000,
            max: 8,
        });
        if (rateLimit.limited) {
            return apiError("RATE_LIMITED", {
                retryAfter: rateLimit.retryAfter,
                message: "Too many signup attempts. Please try again later.",
            });
        }

        const payload = await readRequestJson(request);
        const userName =
            typeof payload.userName === "string"
                ? payload.userName.trim().slice(0, 50)
                : "";
        const email = normalizeEmail(payload.email);
        const password = typeof payload.password === "string" ? payload.password : "";

        if (!userName) {
            return apiError("VALIDATION_ERROR", {
                title: "Name required",
                message: "Please enter a username.",
            });
        }
        if (validateEmail(email)) {
            return apiError("VALIDATION_ERROR", {
                title: "Invalid email",
                message: "Please enter a valid email address.",
            });
        }
        if (validatePassword(password)) {
            return apiError("VALIDATION_ERROR", {
                title: "Invalid password",
                message: "Use a password between 8 and 72 characters.",
            });
        }

        await dbConnect();

        const existingUser = await User.findOne({ email }).select("_id").lean();
        if (existingUser) {
            return apiError("CONFLICT", {
                title: "Account already exists",
                message: "An account with that email already exists. Try logging in, or request a new password link.",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        userData = await UserData.create({});
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationTokenHash = hashToken(verificationToken);

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

        const url = getAppLink(`/verify-email/${verificationToken}`, request);
        const title = "Welcome to HeyKasa! Verify Your Email";
        const body = getVerificationEmailTemplate(userName, url, {
            logoUrl: getPublicAssetUrl("/icon-192x192.png", request),
            lightPillarUrl: getPublicAssetUrl("/email-light-pillar.png", request),
        });

        try {
            await mailSender(email, title, body);
        } catch {
            await Promise.allSettled([
                User.deleteOne({ _id: result._id }),
                UserData.deleteOne({ _id: userData._id }),
            ]);
            return apiError("BAD_GATEWAY", {
                title: "Verification email unavailable",
                message: "We could not send the verification email. Please try again.",
            });
        }

        return apiSuccess(
            {
                userName: result.userName,
                email: result.email,
            },
            {
                status: 201,
                message: "User created successfully. Please check your email to verify your account.",
            },
        );
    } catch (error) {
        await Promise.allSettled([
            createdUser?._id
                ? User.deleteOne({ _id: createdUser._id })
                : Promise.resolve(),
            userData?._id
                ? UserData.deleteOne({ _id: userData._id })
                : Promise.resolve(),
        ]);
        if (error?.code === 11000) {
            return apiError("CONFLICT", {
                title: "Account already exists",
                message: "An account with that email already exists. Try logging in.",
            });
        }
        return handleApiError(error, "Signup");
    }
}
