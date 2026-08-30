import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import dbConnect from "@/utils/dbconnect";

const MAX_SEARCHES = 30;

// Records a search term so recommendations.js has a real signal for brand-new
// accounts that haven't played anything yet (previously this field was declared
// in the schema but never written to).
export async function POST(request) {
  const token = await getToken({ req: request, secret: process.env.JWT_SECRET });
  if (!token?.email) {
    return NextResponse.json({ success: false, message: "User not logged in", data: null }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const term = typeof body?.term === "string" ? body.term.trim().slice(0, 100) : "";
  if (!term) {
    return NextResponse.json({ success: false, message: "A search term is required", data: null }, { status: 400 });
  }

  try {
    await dbConnect();
    const user = await User.findOne({ email: token.email }).select("userData").lean();
    if (!user?.userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const userData = await UserData.findById(user.userData).select("searches");
    if (!userData) {
      return NextResponse.json({ success: false, message: "User data not found", data: null }, { status: 404 });
    }
    const existing = Array.isArray(userData.searches) ? userData.searches : [];
    const deduped = existing.filter((value) => value.toLowerCase() !== term.toLowerCase());
    userData.searches = [...deduped, term].slice(-MAX_SEARCHES);
    await userData.save();
    return NextResponse.json({ success: true, message: "Search recorded", data: userData.searches });
  } catch (e) {
    console.error("searches error", e);
    return NextResponse.json({ success: false, message: "Something went wrong", data: null }, { status: 500 });
  }
}
