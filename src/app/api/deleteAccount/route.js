import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { tokenOptions } from "@/utils/authToken";
import { sendMail } from "@/utils/mailSender";

export async function POST(request) {
  try {
    const token = await getToken(tokenOptions(request));
    const userEmail = token?.email || "Guest user (Client IP)";
    
    // Send email to monitored inbox
    await sendMail({
      email: "support@domain.com",
      subject: `DATA DELETION REQUEST - ${userEmail}`,
      body: `<p>A user has formally requested their account and data to be deleted.</p><p>User Identifier: <strong>${userEmail}</strong></p>`
    });

    return NextResponse.json({ success: true, message: "Deletion request sent." }, { status: 200 });
  } catch (error) {
    console.error("Deletion request error", error);
    return NextResponse.json({ error: "Failed to send deletion request" }, { status: 500 });
  }
}