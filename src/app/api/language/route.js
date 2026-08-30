import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import dbConnect from "@/utils/dbconnect";

export async function GET(request) {
  const token = await getToken({ req: request, secret: process.env.JWT_SECRET });
  if (!token?.email) return NextResponse.json({ authenticated: false, language: null });

  await dbConnect();
  const user = await User.findOne({ email: token.email }).select("userData").lean();
  const userData = user?.userData ? await UserData.findById(user.userData).select("language").lean() : null;
  return NextResponse.json({ authenticated: true, language: userData?.language || null });
}

export async function PUT(request) {
  const token = await getToken({ req: request, secret: process.env.JWT_SECRET });
  if (!token?.email) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const language = Array.isArray(body?.language)
    ? [...new Set(body.language.filter((value) => typeof value === "string"))]
    : [];

  await dbConnect();
  const user = await User.findOne({ email: token.email }).select("userData").lean();
  if (!user?.userData) return NextResponse.json({ error: "User profile not found." }, { status: 404 });
  const userData = await UserData.findByIdAndUpdate(
    user.userData,
    { $set: { language } },
    { new: true, runValidators: true },
  ).select("language").lean();
  return NextResponse.json({ success: true, language: userData.language });
}
