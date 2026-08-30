import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import dbConnect from "@/utils/dbconnect";
import { tokenOptions } from "@/utils/authToken";

const MAX_FOLLOWED_ARTISTS = 100;

export async function GET(request) {
  const token = await getToken(tokenOptions(request));
  if (!token?.email) {
    return NextResponse.json({ success: false, message: "User not logged in", data: null }, { status: 401 });
  }

  try {
    await dbConnect();
    const user = await User.findOne({ email: token.email }).select("userData").lean();
    if (!user?.userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const userData = await UserData.findById(user.userData).select("followedArtists").lean();
    return NextResponse.json({ success: true, message: "Followed artists found", data: userData?.followedArtists || [] });
  } catch (e) {
    console.error("get followed artists error", e);
    return NextResponse.json({ success: false, message: "Something went wrong", data: null }, { status: 500 });
  }
}

// Toggles a followed channel/artist by name (YouTube channel IDs aren't a clean search
// query, so we store the channel display name used directly as a recommendations seed).
export async function POST(request) {
  const token = await getToken(tokenOptions(request));
  if (!token?.email) {
    return NextResponse.json({ success: false, message: "User not logged in", data: null }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) {
    return NextResponse.json({ success: false, message: "An artist name is required", data: null }, { status: 400 });
  }

  try {
    await dbConnect();
    const user = await User.findOne({ email: token.email }).select("userData").lean();
    if (!user?.userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const userData = await UserData.findById(user.userData).select("followedArtists");
    if (!userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const existing = Array.isArray(userData.followedArtists) ? userData.followedArtists : [];
    const alreadyFollowing = existing.some((value) => value.toLowerCase() === name.toLowerCase());
    userData.followedArtists = alreadyFollowing
      ? existing.filter((value) => value.toLowerCase() !== name.toLowerCase())
      : [...existing, name].slice(-MAX_FOLLOWED_ARTISTS);
    await userData.save();
    return NextResponse.json({
      success: true,
      message: alreadyFollowing ? "Unfollowed" : "Followed",
      data: userData.followedArtists,
    });
  } catch (e) {
    console.error("follow artist error", e);
    return NextResponse.json({ success: false, message: "Something went wrong", data: null }, { status: 500 });
  }
}
