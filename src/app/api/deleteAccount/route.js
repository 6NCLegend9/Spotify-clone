import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { tokenOptions } from "@/utils/authToken";
import mailSender from "@/utils/mailSender";
import User from "@/models/User";
import UserData from "@/models/UserData";
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
      if (user.userData) {
        await UserData.findByIdAndDelete(user.userData);
      }
      await User.findOneAndDelete({ email: userEmail });
    }

    // 4. Dispatch notification using process.env.MONITORED_INBOX
    const monitoredInbox = process.env.MONITORED_INBOX;
    if (monitoredInbox) {
      await mailSender(
        monitoredInbox,
        `DATA DELETED - ${userEmail}`,
        `<p>A user has formally requested their account to be deleted.</p><p>Identifier: <strong>${userEmail}</strong></p><p>Status: All associated database records successfully wiped securely.</p>`
      );
    }

    // 5. Structure JSON Response
    return NextResponse.json({ success: true, message: "Account data permanently deleted." }, { status: 200 });
  } catch (error) {
    console.error("Deletion request error:", error);
    return NextResponse.json({ error: "Failed to process database deletion request." }, { status: 500 });
  }
}