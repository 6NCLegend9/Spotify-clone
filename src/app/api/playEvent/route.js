import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import dbConnect from "@/utils/dbconnect";
import { tokenOptions } from "@/utils/authToken";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_ENTRIES = 200;

// Records whether a track played to the end or was skipped early. skippedTracks feeds
// recommendations.js's exclusion filter; completedPlays is stored for future use (e.g.
// a "most played" view) but isn't consumed by anything yet.
export async function POST(request) {
  const token = await getToken(tokenOptions(request));
  if (!token?.email) {
    return NextResponse.json({ success: false, message: "User not logged in", data: null }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const event = body?.event;
  if (typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id)) {
    return NextResponse.json({ success: false, message: "A valid track id is required", data: null }, { status: 400 });
  }
  if (event !== "completed" && event !== "skipped") {
    return NextResponse.json({ success: false, message: "A valid event type is required", data: null }, { status: 400 });
  }

  const field = event === "completed" ? "completedPlays" : "skippedTracks";

  try {
    await dbConnect();
    const user = await User.findOne({ email: token.email }).select("userData").lean();
    if (!user?.userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const userData = await UserData.findById(user.userData).select(field);
    if (!userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const existing = Array.isArray(userData[field]) ? userData[field] : [];
    if (!existing.includes(id)) {
      userData[field] = [...existing, id].slice(-MAX_ENTRIES);
      await userData.save();
    }
    return NextResponse.json({ success: true, message: "Recorded", data: userData[field] });
  } catch (e) {
    console.error("play event error", e);
    return NextResponse.json({ success: false, message: "Something went wrong", data: null }, { status: 500 });
  }
}
