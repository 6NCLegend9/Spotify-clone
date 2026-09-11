import { getSessionUser } from "@/utils/sessionAuth";
import mailSender from "@/utils/mailSender";
import User from "@/models/User";
import UserData from "@/models/UserData";
import Playlist from "@/models/Playlist";
import Genre from "@/models/Genre";
import Tag from "@/models/Tag";
import { ApiRouteError, apiError, apiSuccess, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return apiError("UNAUTHORIZED");
    }
    if (request.headers.get("origin") !== new URL(request.url).origin) return apiError("FORBIDDEN");
    const body = await readRequestJson(request);
    if (body.confirm !== "DELETE") return apiError("VALIDATION_ERROR", { message: "Confirm account deletion." });
    const userEmail = user.email;

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

    await User.db.transaction(async (session) => {
      const current = await User.findById(user._id).session(session);
      if (!current || (current.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) {
        throw new ApiRouteError("UNAUTHORIZED");
      }
      const owned = await Playlist.find({ user: user._id }).select("_id").session(session).lean();
      const ids = owned.map((playlist) => playlist._id);
      await Playlist.updateMany(
        { $or: [{ collaborators: user._id }, { likedBy: user._id }] },
        { $pull: { collaborators: user._id, likedBy: user._id }, $inc: { __v: 1 } },
        { session },
      );
      if (ids.length) {
        await UserData.updateMany(
          { $or: [{ playlists: { $in: ids } }, { likedPlaylists: { $in: ids } }] },
          { $pull: { playlists: { $in: ids }, likedPlaylists: { $in: ids } }, $inc: { __v: 1 } },
          { session },
        );
      }
      await Playlist.deleteMany({ user: user._id }, { session });
      await Genre.deleteMany({ scope: "personal", ownerId: user._id }, { session });
      await Tag.deleteMany({ scope: "personal", ownerId: user._id }, { session });
      if (current.userData) await UserData.deleteOne({ _id: current.userData }, { session });
      await User.deleteOne({ _id: user._id }, { session });
    });

    const monitoredInbox = process.env.MONITORED_INBOX;
    if (monitoredInbox) {
      try {
        await mailSender(
          monitoredInbox,
          "Account deletion completed",
          "<p>An account and its associated data were deleted successfully.</p>"
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