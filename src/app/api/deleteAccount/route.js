import { getToken } from "next-auth/jwt";
import { tokenOptions } from "@/utils/authToken";
import mailSender from "@/utils/mailSender";
import User from "@/models/User";
import UserData from "@/models/UserData";
import Playlist from "@/models/Playlist";
import Genre from "@/models/Genre";
import Tag from "@/models/Tag";
import dbConnect from "@/utils/dbconnect";
import { apiError, apiSuccess, handleApiError } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  try {
    const token = await getToken(tokenOptions(request));
    const userEmail =
      typeof token?.email === "string"
        ? token.email.trim().toLowerCase()
        : "";
    
    if (!userEmail) {
      return apiError("UNAUTHORIZED");
    }

    const rateLimit = await isRateLimited(`delete-account:${userEmail}`, {
      windowMs: 60 * 60_000,
      max: 3,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many account deletion attempts. Please wait before trying again.",
      });
    }

    await dbConnect();
    
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

    const monitoredInbox = process.env.MONITORED_INBOX;
    if (monitoredInbox) {
      try {
        await mailSender(
          monitoredInbox,
          `DATA DELETED - ${userEmail}`,
          `<p>A user has formally requested their account to be deleted.</p><p>Identifier: <strong>${userEmail}</strong></p><p>Status: Account and associated user records have been deleted.</p>`
        );
      } catch {
        console.error("Account deletion notification could not be sent.");
      }
    }

    return apiSuccess(null, { message: "Account data permanently deleted." });
  } catch (error) {
    return handleApiError(error, "Account deletion");
  }
}