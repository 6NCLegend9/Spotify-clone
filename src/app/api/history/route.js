import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import dbConnect from "@/utils/dbconnect";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_HISTORY_ENTRIES = 20;

// Fetch the signed-in user's server-synced listening history.
export async function GET(request) {
  const token = await getToken({ req: request, secret: process.env.JWT_SECRET });
  if (!token?.email) {
    return NextResponse.json({ success: false, message: "User not logged in", data: null }, { status: 401 });
  }

  try {
    await dbConnect();
    const user = await User.findOne({ email: token.email }).select("userData").lean();
    if (!user?.userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const userData = await UserData.findById(user.userData).select("songHistory").lean();
    return NextResponse.json({ success: true, message: "History found", data: userData?.songHistory || [] });
  } catch (e) {
    console.error("get history error", e);
    return NextResponse.json({ success: false, message: "Something went wrong", data: null }, { status: 500 });
  }
}

// Record a played track in the signed-in user's server-synced listening history.
export async function POST(request) {
  const token = await getToken({ req: request, secret: process.env.JWT_SECRET });
  if (!token?.email) {
    return NextResponse.json({ success: false, message: "User not logged in", data: null }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const entry = body?.entry;
  if (!entry || typeof entry.id !== "string") {
    return NextResponse.json({ success: false, message: "A valid track entry is required", data: null }, { status: 400 });
  }
  if (entry.source === "youtube" && !YOUTUBE_ID_PATTERN.test(entry.id)) {
    return NextResponse.json({ success: false, message: "A valid YouTube track id is required", data: null }, { status: 400 });
  }

  try {
    await dbConnect();
    const user = await User.findOne({ email: token.email }).select("userData").lean();
    if (!user?.userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const userData = await UserData.findById(user.userData);
    if (!userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const existing = Array.isArray(userData.songHistory) ? userData.songHistory : [];
    const deduped = existing.filter((song) => song?.id !== entry.id);
    userData.songHistory = [entry, ...deduped].slice(0, MAX_HISTORY_ENTRIES);
    userData.markModified("songHistory");
    await userData.save();
    return NextResponse.json({ success: true, message: "History updated", data: userData.songHistory });
  } catch (e) {
    console.error("post history error", e);
    return NextResponse.json({ success: false, message: "Something went wrong", data: null }, { status: 500 });
  }
}
