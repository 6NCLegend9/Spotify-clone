import { NextResponse } from "next/server";
import mongoose from "mongoose";
import User from "@/models/User";
import Playlist from "@/models/Playlist";
import UserData from "@/models/UserData";
import { isRateLimited } from "@/utils/rateLimit";
import {
    ApiRouteError,
    apiError,
    handleApiError,
    readRequestJson,
} from "@/utils/apiResponse";
import { inferPlaylistCategory, normalizePlaylistCategory, serializePlaylist, isCoverDataUrl } from "@/utils/playlistThemes";
import { getAuthenticatedAccount } from "@/utils/userAccount";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_USER_PLAYLISTS = 200;
const MAX_COLLABORATORS = 50;

async function getAuthenticatedUser(req) {
    const { user } = await getAuthenticatedAccount(req);
    return user;
}

function requirePlaylistId(value) {
    if (typeof value !== "string" || !mongoose.isObjectIdOrHexString(value)) {
        throw new ApiRouteError("VALIDATION_ERROR", { message: "A valid playlist is required" });
    }
    return value;
}

// Create a new playlist
export async function POST(req){
    try {
        const { user, userData } = await getAuthenticatedAccount(req);
        const rateLimit = await isRateLimited(`playlists:create:${user._id}`, {
            windowMs: 15 * 60_000,
            max: 30,
        });
        if (rateLimit.limited) {
            return apiError("RATE_LIMITED", {
                retryAfter: rateLimit.retryAfter,
                message: "Too many playlist changes. Please wait before trying again.",
            });
        }
        const body = await readRequestJson(req);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const category = inferPlaylistCategory(name, body.category);
        const subgenre = typeof body.subgenre === "string" ? body.subgenre.trim().slice(0, 48) : "";
        const coverImage = isCoverDataUrl(body.coverImage) ? body.coverImage : "";
        if (!name || name.length > 80) {
            return apiError("VALIDATION_ERROR", {
                message: "A playlist name between 1 and 80 characters is required",
            });
        }

        if ((userData.playlists || []).length >= MAX_USER_PLAYLISTS) {
            return apiError("VALIDATION_ERROR", {
                message: `You can create up to ${MAX_USER_PLAYLISTS} playlists`,
            });
        }

        const playlist = await Playlist.create({
            name,
            user: user._id,
            category,
            subgenre,
            coverImage,
        });
        if (!Array.isArray(userData.playlists)) {
            userData.playlists = [];
        }
        userData.playlists.push(playlist._id);
        try {
            await userData.save();
        } catch (error) {
            await Playlist.deleteOne({ _id: playlist._id }).catch(() => {});
            throw error;
        }
        return NextResponse.json(
            {
                success: true,
                message: "Playlist created",
                data: {
                    playlist: serializePlaylist(playlist, user._id)
                }
            }
        );
    } catch (e) {
        return handleApiError(e, "create playlist");
    }
}

// delete a playlist
export async function DELETE(req){
    try {
        const user = await getAuthenticatedUser(req);
        const rateLimit = await isRateLimited(`playlists:delete:${user._id}`, {
            windowMs: 15 * 60_000,
            max: 40,
        });
        if (rateLimit.limited) {
            return apiError("RATE_LIMITED", {
                retryAfter: rateLimit.retryAfter,
                message: "Too many playlist changes. Please wait before trying again.",
            });
        }
        const body = await readRequestJson(req);
        const playlistId = requirePlaylistId(body.playlistId);
        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            return apiError("NOT_FOUND", { message: "Playlist not found" });
        }
        if (playlist.user.toString() !== user._id.toString()) {
            return apiError("FORBIDDEN", {
                message: "You are not authorized to delete this playlist",
            });
        }
        await Playlist.deleteOne({ _id: playlistId });
        await UserData.updateMany(
            { $or: [{ playlists: playlistId }, { likedPlaylists: playlistId }] },
            { $pull: { playlists: playlistId, likedPlaylists: playlistId } },
        );
        return NextResponse.json(
            {
                success: true,
                message: "Playlist deleted",
                data: null
            }
        );
    } catch (e) {
        return handleApiError(e, "delete playlist");
    }
}

// update playlist library settings or collaborators
export async function PATCH(req){
    try {
        const user = await getAuthenticatedUser(req);
        const rateLimit = await isRateLimited(`playlists:update:${user._id}`, {
            windowMs: 15 * 60_000,
            max: 120,
        });
        if (rateLimit.limited) {
            return apiError("RATE_LIMITED", {
                retryAfter: rateLimit.retryAfter,
                message: "Too many playlist changes. Please wait before trying again.",
            });
        }
        const body = await readRequestJson(req);
        const playlistId = requirePlaylistId(body.playlistId);
        const { action, value, email } = body;
        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            return apiError("NOT_FOUND", { message: "Playlist not found" });
        }
        if (playlist.user.toString() !== user._id.toString()) {
            return apiError("FORBIDDEN", {
                message: "Only the playlist owner can make this change",
            });
        }

        if (action === "pinned") {
            if (typeof value !== "boolean") {
                return apiError("VALIDATION_ERROR", { message: "Pinned must be true or false" });
            }
            playlist.pinned = value;
        } else if (action === "smartShuffle") {
            if (typeof value !== "boolean") {
                return apiError("VALIDATION_ERROR", {
                    message: "Smart shuffle must be true or false",
                });
            }
            playlist.smartShuffle = value;
        } else if (action === "visibility" && ["public", "private"].includes(value)) {
            playlist.visibility = value;
        } else if (action === "category") {
            playlist.category = normalizePlaylistCategory(value);
        } else if (action === "subgenre") {
            playlist.subgenre = typeof value === "string" ? value.trim().slice(0, 48) : "";
        } else if (action === "cover") {
            if (value === "" || value == null) {
                playlist.coverImage = "";
            } else if (!isCoverDataUrl(value)) {
                return apiError("VALIDATION_ERROR", {
                    message: "That cover image is too large or not a supported type.",
                });
            } else {
                playlist.coverImage = value;
            }
        } else if (action === "addCollaborator") {
            const collaboratorEmail = typeof email === "string"
                ? email.trim().toLowerCase().slice(0, 254)
                : "";
            if (!collaboratorEmail) {
                return apiError("VALIDATION_ERROR", {
                    message: "A collaborator email is required",
                });
            }
            const collaborator = await User.findOne({ email: collaboratorEmail });
            if (!collaborator) {
                return apiError("NOT_FOUND", {
                    message: "No HeyKasa account uses that email",
                });
            }
            if (collaborator._id.toString() === user._id.toString()) {
                return apiError("VALIDATION_ERROR", {
                    message: "You already own this playlist",
                });
            }
            const alreadyCollaborating = playlist.collaborators.some(
                (id) => id.toString() === collaborator._id.toString(),
            );
            if (!alreadyCollaborating && playlist.collaborators.length >= MAX_COLLABORATORS) {
                return apiError("VALIDATION_ERROR", {
                    message: `A playlist can have up to ${MAX_COLLABORATORS} collaborators`,
                });
            }
            if (!alreadyCollaborating) {
                playlist.collaborators.push(collaborator._id);
            }
        } else {
            return apiError("VALIDATION_ERROR", {
                message: "Unsupported playlist update",
            });
        }

        await playlist.save();
        await playlist.populate("user", "userName imageUrl");
        await playlist.populate("collaborators", "userName imageUrl");
        return NextResponse.json({
            success: true,
            message: action === "addCollaborator" ? "Collaborator added" : "Playlist updated",
            data: { playlist: serializePlaylist(playlist, user._id) }
        });
    } catch (e) {
        return handleApiError(e, "update playlist");
    }
}


// get all playlists
export async function GET(req){
    try {
        const { user, userData } = await getAuthenticatedAccount(req);
        const playlists = await Playlist.find({
            $or: [
                { _id: { $in: userData.playlists || [] } },
                { _id: { $in: userData.likedPlaylists || [] } },
                { collaborators: user._id }
            ]
        })
            .populate("user", "userName imageUrl")
            .populate("collaborators", "userName imageUrl")
            .sort({ updatedAt: -1 });
        return NextResponse.json(
            {
                success: true,
                message: "Playlists fetched",
                data: {
                    playlists: playlists.map((playlist) => serializePlaylist(playlist, user._id))
                }
            }
        );

    } catch (e) {
        return handleApiError(e, "get playlists");
    }
}