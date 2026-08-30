import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import dbConnect from "@/utils/dbconnect";
import { tokenOptions } from "@/utils/authToken";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_NOT_INTERESTED = 200;

// Marks a track as "not interested" so recommendations.js's existing exclusion
// filter (previously always a no-op, since nothing wrote to this field) has data.
export async function POST(request) {
  const token = await getToken(tokenOptions(request));
  if (!token?.email) {
    return NextResponse.json({ success: false, message: "User not logged in", data: null }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id)) {
    return NextResponse.json({ success: false, message: "A valid track id is required", data: null }, { status: 400 });
  }

  try {
    await dbConnect();
    const user = await User.findOne({ email: token.email }).select("userData").lean();
    if (!user?.userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const userData = await UserData.findById(user.userData).select("notInterested");
    if (!userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const existing = Array.isArray(userData.notInterested) ? userData.notInterested : [];
    if (!existing.includes(id)) {
      userData.notInterested = [...existing, id].slice(-MAX_NOT_INTERESTED);
      await userData.save();
    }
    return NextResponse.json({ success: true, message: "Preference saved", data: userData.notInterested });
  } catch (e) {
    console.error("not-interested error", e);
    return NextResponse.json({ success: false, message: "Something went wrong", data: null }, { status: 500 });
  }
}
