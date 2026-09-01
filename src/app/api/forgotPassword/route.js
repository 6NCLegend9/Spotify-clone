import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import mailSender from "@/utils/mailSender";
import dbConnect from "@/utils/dbconnect";
import { getResetPasswordTemplate } from "@/emails/ResetPasswordEmail";
import { getAppUrl } from "@/utils/appUrl";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";

export const runtime = "nodejs";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(request) {
  if (isRateLimited(getClientKey(request), { windowMs: 15 * 60_000, max: 6 })) {
    return NextResponse.json(
      { success: false, message: "Too many reset attempts. Please try again later.", data: null },
      { status: 429 },
    );
  }

  const payload = await request.json().catch(() => null);
  const email =
    typeof payload?.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";

  if (!email) {
    return NextResponse.json(
      {
        success: false,
        code: "EMAIL_REQUIRED",
        title: "Email required",
        message: "Please enter your email address.",
        data: null,
      },
      { status: 400 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_EMAIL",
        title: "Invalid email",
        message: "Please enter a valid email address.",
        data: null,
      },
      { status: 400 },
    );
  }

  try {
    await dbConnect();
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          code: "EMAIL_NOT_FOUND",
          title: "Email not found",
          message:
            "We couldn't find an account using that email. Please check the spelling or try requesting a new link.",
          data: null,
        },
        { status: 404 },
      );
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = hashToken(resetToken);
    user.resetPasswordExpires = Date.now() + 15 * 60_000;
    await user.save();

    const url = `${getAppUrl(request)}/reset-password/${resetToken}`;
    try {
      await mailSender(
        user.email,
        "Reset Password - HeyKasa",
        getResetPasswordTemplate(url),
      );
    } catch (mailError) {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save().catch(() => {});
      console.error("Reset email delivery failed:", mailError);
      return NextResponse.json(
        {
          success: false,
          message: "We could not send the reset email. Please try again.",
          data: null,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      title: "Check your email",
      message: "If that inbox can receive mail, a reset link is on the way. It expires in 15 minutes.",
      data: null,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { success: false, message: "Something went wrong", data: null },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  if (isRateLimited(getClientKey(request), { windowMs: 15 * 60_000, max: 10 })) {
    return NextResponse.json(
      { success: false, message: "Too many reset attempts. Please try again later.", data: null },
      { status: 429 },
    );
  }

  const payload = await request.json().catch(() => null);
  const token = typeof payload?.token === "string" ? payload.token.trim() : "";
  const password = typeof payload?.password === "string" ? payload.password : "";
  const confirmPassword =
    typeof payload?.confirmPassword === "string"
      ? payload.confirmPassword
      : "";

  if (!/^[a-f0-9]{40,128}$/i.test(token)) {
    return NextResponse.json(
      { success: false, message: "Invalid or expired reset link.", data: null },
      { status: 400 },
    );
  }
  if (password.length < 8 || password.length > 72) {
    return NextResponse.json(
      { success: false, message: "Password must be between 8 and 72 characters.", data: null },
      { status: 400 },
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json(
      { success: false, message: "Passwords do not match.", data: null },
      { status: 400 },
    );
  }

  try {
    await dbConnect();
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.findOneAndUpdate(
      {
        resetPasswordToken: { $in: [token, hashToken(token)] },
        resetPasswordExpires: { $gt: Date.now() },
      },
      {
        $set: {
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        },
      },
      { new: true },
    ).select("_id");

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired reset link.", data: null },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password updated successfully",
      data: null,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { success: false, message: "Something went wrong", data: null },
      { status: 500 },
    );
  }
}
