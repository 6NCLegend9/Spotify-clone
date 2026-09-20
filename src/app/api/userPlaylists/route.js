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
import {
    matchPlaylistCategory,
    categoryFromGenres,
    normalizePlaylistCategory,
    serializePlaylist,
    isCoverDataUrl,
    PLAYLIST_SEED_QUERIES,
} from "@/utils/playlistThemes";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import { youtubeFetch } from "@/utils/youtubeApi";
import { canViewPlaylist, libraryPlaylistFilter } from "@/utils/playlistAccess.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_USER_PLAYLISTS = 200;
const MAX_COLLABORATORS = 50;
const AUTO_FILL_SONG_COUNT = 12;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

async function getAuthenticatedUser(req) {
    const { user } = await getAuthenticatedAccount(req);
    return user;
}

function shuffle(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Prefer the playlist name, then an explicit client choice, then the listener's
// saved taste, before finally defaulting to Pop.
function resolvePlaylistCategory(name, requested, genres) {
    const byName = matchPlaylistCategory(name);
    if (byName) return byName;
    const requestedNorm = typeof requested === "string" && requested.trim()
        ? normalizePlaylistCategory(requested)
        : null;
    if (requestedNorm && requestedNorm !== "Pop") return requestedNorm;
    return categoryFromGenres(genres) || requestedNorm || "Pop";
}

// Pull a shuffled set of on-genre YouTube track ids to seed a new playlist.
async function fetchGenreSongIds(category, limit) {
    const queries = PLAYLIST_SEED_QUERIES[category] || PLAYLIST_SEED_QUERIES.Pop;
    const results = await Promise.allSettled(
        queries.map((query) =>
            youtubeFetch("search", {
                part: "snippet",
                type: "video",
                videoCategoryId: "10",
                videoEmbeddable: "true",
                maxResults: "10",
                q: `${query} official audio`,
            }),
        ),
    );
    const ids = new Set();
    for (const result of results) {
        if (result.status !== "fulfilled" || !result.value?.ok) continue;
        const items = Array.isArray(result.value.data?.items) ? result.value.data.items : [];
        for (const item of items) {
            const id = item?.id?.videoId;
            if (id && YOUTUBE_ID_PATTERN.test(id)) ids.add(id);
        }
    }
    return shuffle([...ids]).slice(0, limit);
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
        const category = resolvePlaylistCategory(name, body.category, userData?.genres);
        const subgenre = typeof body.subgenre === "string" ? body.subgenre.trim().slice(0, 48) : "";
        const coverImage = isCoverDataUrl(body.coverImage) ? body.coverImage : "";
        const autoFill = body.autoFill === true;
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

        if (body.songs !== undefined && (!Array.isArray(body.songs) || body.songs.length > 500
            || body.songs.some((id) => typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id)))) {
            return apiError("VALIDATION_ERROR", { message: "A queue can contain up to 500 valid tracks." });
        }
        let songs = [...new Set(body.songs || [])];
        const songAddedAt = {};
        if (autoFill && !songs.length) {
            songs = await fetchGenreSongIds(category, AUTO_FILL_SONG_COUNT).catch(() => []);
        }
        const now = new Date();
        songs.forEach((id) => { songAddedAt[id] = now; });

        let playlist;
        await User.db.transaction(async (session) => {
            const profile = await UserData.findById(userData._id).session(session);
            if (!profile) throw new ApiRouteError("NOT_FOUND");
            if ((profile.playlists || []).length >= MAX_USER_PLAYLISTS) {
                throw new ApiRouteError("VALIDATION_ERROR", { message: `You can create up to ${MAX_USER_PLAYLISTS} playlists` });
            }
            [playlist] = await Playlist.create([{ name, user: user._id, category, subgenre, coverImage, songs, songAddedAt }], { session });
            await UserData.updateOne({ _id: profile._id }, {
                $set: { playlists: [...(profile.playlists || []), playlist._id] }, $inc: { __v: 1 },
            }, { session });
        });
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
        await User.db.transaction(async (session) => {
            const current = await Playlist.findById(playlistId).session(session);
            if (!current) throw new ApiRouteError("NOT_FOUND");
            if (String(current.user) !== String(user._id)) throw new ApiRouteError("FORBIDDEN");
            await Playlist.deleteOne({ _id: playlistId }, { session });
            await UserData.updateMany(
                { $or: [{ playlists: playlistId }, { likedPlaylists: playlistId }] },
                { $pull: { playlists: { $in: [playlistId] }, likedPlaylists: { $in: [playlistId] } }, $inc: { __v: 1 } },
                { session },
            );
        });
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

        if (action === "name") {
            if (typeof value !== "string" || !value.trim() || value.trim().length > 80) {
                return apiError("VALIDATION_ERROR", { message: "A playlist name between 1 and 80 characters is required" });
            }
            playlist.name = value.trim();
        } else if (action === "pinned") {
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
            if (collaborator && collaborator._id.toString() === user._id.toString()) {
                return apiError("VALIDATION_ERROR", {
                    message: "You already own this playlist",
                });
            }
            const alreadyCollaborating = Boolean(
                collaborator
                && playlist.collaborators.some((id) => id.toString() === collaborator._id.toString()),
            );
            if (!alreadyCollaborating && playlist.collaborators.length >= MAX_COLLABORATORS) {
                return apiError("VALIDATION_ERROR", {
                    message: `A playlist can have up to ${MAX_COLLABORATORS} collaborators`,
                });
            }
            if (collaborator && !alreadyCollaborating) {
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
            message: action === "addCollaborator"
                ? "If that email has a HayKasa account, they now have access."
                : "Playlist updated",
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
        const playlists = await Playlist.find(libraryPlaylistFilter(user._id, userData.likedPlaylists))
            .populate("user", "userName imageUrl")
            .populate("collaborators", "userName imageUrl")
            .sort({ updatedAt: -1 });
        return NextResponse.json(
            {
                success: true,
                message: "Playlists fetched",
                data: {
                    playlists: playlists.filter((playlist) => canViewPlaylist(playlist, user._id))
                        .map((playlist) => serializePlaylist(playlist, user._id))
                }
            },
            { headers: { "Cache-Control": "private, no-store" } },
        );

    } catch (e) {
        return handleApiError(e, "get playlists");
    }
}
