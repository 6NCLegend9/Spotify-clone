import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Playlist from "@/models/Playlist";
import { isRateLimited } from "@/utils/rateLimit";
import {
  apiError,
  handleApiError,
  readRequestJson,
} from "@/utils/apiResponse";
import { serializePlaylist } from "@/utils/playlistThemes";
import { getAuthenticatedAccount } from "@/utils/userAccount";

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
    const playlistId = body.playlistId;
    if (typeof playlistId !== "string" || !mongoose.isObjectIdOrHexString(playlistId)) {
      return apiError("VALIDATION_ERROR", { message: "A valid playlist is required." });
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
      return apiError("NOT_FOUND", { message: "This playlist could not be found." });
    }

    const isOwner = playlist.user.toString() === user._id.toString();
    const isCollaborator = playlist.collaborators?.some((id) => id.toString() === user._id.toString());
    if (playlist.visibility !== "public" && !isOwner && !isCollaborator) {
      return apiError("FORBIDDEN", { message: "This playlist is private." });
    }

    const alreadyLiked = (playlist.likedBy || []).some((id) => id.toString() === user._id.toString());
    if (alreadyLiked) {
      playlist.likedBy = (playlist.likedBy || []).filter((id) => id.toString() !== user._id.toString());
    } else {
      playlist.likedBy = [...(playlist.likedBy || []), user._id];
    }
    await playlist.save();

    if (alreadyLiked) {
      userData.likedPlaylists = (userData.likedPlaylists || []).filter(
        (id) => id.toString() !== playlistId,
      );
    } else if (!(userData.likedPlaylists || []).some((id) => id.toString() === playlistId)) {
      userData.likedPlaylists = [
        ...(userData.likedPlaylists || []),
        playlist._id,
      ].slice(-MAX_LIKED_PLAYLISTS);
    }
    await userData.save();

    const serialized = serializePlaylist(playlist, user._id);
    return NextResponse.json({
      success: true,
      message: alreadyLiked ? "Removed from liked playlists" : "Added to liked playlists",
      data: serialized,
    });
  } catch (error) {
    return handleApiError(error, "update playlist like");
  }
}
