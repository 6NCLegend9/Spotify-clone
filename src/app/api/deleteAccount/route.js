import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { tokenOptions } from "@/utils/authToken";
import mailSender from "@/utils/mailSender";
import User from "@/models/User";
import UserData from "@/models/UserData";
import Playlist from "@/models/Playlist";
import Genre from "@/models/Genre";
import Tag from "@/models/Tag";
import dbConnect from "@/utils/dbconnect";

export async function POST(request) {
  try {
    const token = await getToken(tokenOptions(request));
    const userEmail = token?.email;
    
    // 1. Authenticate request. Reject if no valid JWT.
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized. Must be logged in to delete data." }, { status: 401 });
    }
    
    // 2. Server-side connection to the database
    await dbConnect();
    
    // 3. Execute actual record deletion in the database
    const user = await User.findOne({ email: userEmail });
    if (user) {
      await Promise.all([
        user.userData ? UserData.findByIdAndDelete(user.userData) : Promise.resolve(),
        Playlist.deleteMany({ user: user._id }),
        Playlist.updateMany(
          { collaborators: user._id },
          { $pull: { collaborators: user._id } }
        ),
        Genre.deleteMany({ scope: "personal", ownerId: user._id }),
        Tag.deleteMany({ scope: "personal", ownerId: user._id }),
      ]);
      await User.findByIdAndDelete(user._id);
    }

    // 4. Dispatch notification using process.env.MONITORED_INBOX
    const monitoredInbox = process.env.MONITORED_INBOX;
    if (monitoredInbox) {
      await mailSender(
        monitoredInbox,
        `DATA DELETED - ${userEmail}`,
        `<p>A user has formally requested their account to be deleted.</p><p>Identifier: <strong>${userEmail}</strong></p><p>Status: Account and associated user records have been deleted.</p>`
      );
    }

    // 5. Structure JSON Response
    return NextResponse.json({ success: true, message: "Account data permanently deleted." }, { status: 200 });
  } catch (error) {
    console.error("Deletion request error:", error);
    return NextResponse.json({ error: "Failed to process database deletion request." }, { status: 500 });
  }
}