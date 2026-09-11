import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Playlist from "@/models/Playlist";
import User from "@/models/User";
import UserData from "@/models/UserData";
import { isRateLimited } from "@/utils/rateLimit";
import {
  ApiRouteError,
  apiError,
  handleApiError,
  readRequestJson,
} from "@/utils/apiResponse";
import { serializePlaylist } from "@/utils/playlistThemes";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import { canViewPlaylist } from "@/utils/playlistAccess.mjs";
import { boundedMembership } from "@/utils/documentMutation.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_LIKED_PLAYLISTS = 500;

export async function POST(req) {
  try {
    const { user, userData } = await getAuthenticatedAccount(req);
    const rateLimit = await isRateLimited(`playlist-like:${user._id}`, {
      windowMs: 15 * 60_000,
      max: 120,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many playlist like updates. Please wait before trying again.",
      });
    }

    const body = await readRequestJson(req);
    if (body.liked !== undefined && typeof body.liked !== "boolean") return apiError("VALIDATION_ERROR");
    const playlistId = body.playlistId;
    if (typeof playlistId !== "string" || !mongoose.isObjectIdOrHexString(playlistId)) {
      return apiError("VALIDATION_ERROR", { message: "A valid playlist is required." });
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
      return apiError("NOT_FOUND", { message: "This playlist could not be found." });
    }

    if (!canViewPlaylist(playlist, user)) {
      return apiError("FORBIDDEN", { message: "This playlist is private." });
    }

    let serialized;
    await User.db.transaction(async (session) => {
      const current = await Playlist.findById(playlistId).session(session);
      const profile = await UserData.findById(userData._id).session(session);
      if (!current || !profile) throw new ApiRouteError("NOT_FOUND");
      if (!canViewPlaylist(current, user)) throw new ApiRouteError("FORBIDDEN");
      const present = (current.likedBy || []).some((id) => String(id) === String(user._id));
      const liked = body.liked ?? !present;
      const likedPlaylists = boundedMembership(profile.likedPlaylists, current._id, liked, MAX_LIKED_PLAYLISTS);
      await UserData.updateOne({ _id: profile._id }, { $set: { likedPlaylists }, $inc: { __v: 1 } }, { session });
      const updated = await Playlist.findOneAndUpdate({ _id: playlistId }, {
        ...(liked ? { $addToSet: { likedBy: user._id } } : { $pull: { likedBy: user._id } }),
        $inc: { __v: 1 },
      }, { new: true, session });
      serialized = serializePlaylist(updated, user._id);
    });
    return NextResponse.json({
      success: true,
      message: serialized.liked ? "Added to liked playlists" : "Removed from liked playlists",
      data: serialized,
    });
  } catch (error) {
    return handleApiError(error, "update playlist like");
  }
}
