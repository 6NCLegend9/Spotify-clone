import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import dbConnect from "@/utils/dbconnect";
import { tokenOptions } from "@/utils/authToken";

const allowedKeys = [
  "transitionMode", "crossfadeSeconds", "eqPreset", "eqBands", "dataSaver", "audioOnly",
  "wifiOnlyDownloads", "streamingQuality", "videoQuality", "normalization", "monoAudio", "explicitContent",
  "privateSession", "tailoredAds", "syncedLyrics", "pictureInPicture", "masterVolume",
];

export async function GET(request) {
  const token = await getToken(tokenOptions(request));
  if (!token?.email) return NextResponse.json({ authenticated: false, settings: null });

  await dbConnect();
  const user = await User.findOne({ email: token.email }).select("userData").lean();
  const userData = user?.userData ? await UserData.findById(user.userData).select("settings genres").lean() : null;
  return NextResponse.json({ authenticated: true, settings: userData?.settings || null, genres: userData?.genres || [] });
}

export async function PUT(request) {
  const token = await getToken(tokenOptions(request));
  if (!token?.email) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

  try {
    const body = await request.json();
    const settings = Object.fromEntries(
      allowedKeys
        .filter((key) => body.settings && body.settings[key] !== undefined)
        .map((key) => [key, body.settings[key]]),
    );
    await dbConnect();
    const user = await User.findOne({ email: token.email }).select("userData").lean();
    if (!user?.userData) return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    const userData = await UserData.findByIdAndUpdate(
      user.userData,
      { $set: Object.fromEntries(Object.entries(settings).map(([key, value]) => [`settings.${key}`, value])) },
      { new: true, runValidators: true },
    ).select("settings").lean();
    return NextResponse.json({ success: true, settings: userData.settings });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Unable to update settings." }, { status: 500 });
  }
}
