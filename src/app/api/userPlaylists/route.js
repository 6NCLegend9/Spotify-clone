import { displayName } from "@/utils/inputText.mjs";
import { randomUUID } from "node:crypto";
import { validatedCover } from "@/utils/coverValidation";
import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
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
    PLAYLIST_SEED_QUERIES,
} from "@/utils/playlistThemes";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import { youtubeFetch } from "@/utils/youtubeApi";
import { canViewPlaylist, libraryPlaylistFilter } from "@/utils/playlistAccess.mjs";
import { filterMusicPlaybackResults } from "@/utils/officialMusicSearch.mjs";
import { mutateDocument } from "@/utils/documentMutation.mjs";
import { getPlaylistItems, playlistItemChanges } from "@/utils/playlistItems.mjs";

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

// An explicit choice is authoritative; infer a theme only when it was omitted.
function resolvePlaylistCategory(name, requested, genres) {
    if (typeof requested === "string" && requested.trim()) return normalizePlaylistCategory(requested);
    return matchPlaylistCategory(name) || categoryFromGenres(genres) || "Pop";
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
        const candidates = items
            .filter((item) => item?.id?.videoId)
            .map((item) => ({
                id: item.id.videoId,
                title: item.snippet?.title || "",
                channel: item.snippet?.channelTitle || "",
                description: item.snippet?.description || "",
            }));
        for (const item of filterMusicPlaybackResults(candidates, category)) {
            if (YOUTUBE_ID_PATTERN.test(item.id)) ids.add(item.id);
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
  if (!isTrustedRequestOrigin(req)) return apiError("FORBIDDEN");
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
        const body = await readRequestJson(req, { maxBytes: 384 * 1024 });
        const name = displayName(body.name, 80);
        if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 300)) {
            return apiError("VALIDATION_ERROR", { message: "Playlist descriptions can contain up to 300 characters." });
        }
        const description = typeof body.description === "string" ? body.description.trim() : "";
        const category = resolvePlaylistCategory(name, body.category, userData?.genres);
        const subgenre = typeof body.subgenre === "string" ? body.subgenre.trim().slice(0, 48) : "";
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
        const coverImage = await validatedCover(body.coverImage);
        let songs = [...new Set(body.songs || [])];
        if (autoFill && !songs.length) {
            songs = await fetchGenreSongIds(category, AUTO_FILL_SONG_COUNT).catch(() => []);
        }
        const now = new Date();
        const initialItems = songs.map((id) => ({ entryId: randomUUID(), id, addedAt: now.toISOString() }));
        const itemFields = playlistItemChanges({}, initialItems);

        let playlist;
        await User.db.transaction(async (session) => {
            const profile = await UserData.findById(userData._id).session(session);
            if (!profile) throw new ApiRouteError("NOT_FOUND");
            if ((profile.playlists || []).length >= MAX_USER_PLAYLISTS) {
                throw new ApiRouteError("VALIDATION_ERROR", { message: `You can create up to ${MAX_USER_PLAYLISTS} playlists` });
            }
            [playlist] = await Playlist.create([{ name, description, user: user._id, category, subgenre, coverImage, ...itemFields }], { session });
            await UserData.updateOne({ _id: profile._id }, {
                $set: { playlists: [...(profile.playlists || []), playlist._id] }, $inc: { __v: 1 },
            }, { session });
            await playlist.populate({ path: "user", select: "userName imageUrl", options: { session } });
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
  if (!isTrustedRequestOrigin(req)) return apiError("FORBIDDEN");
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
        const body = await readRequestJson(req, { maxBytes: 384 * 1024 });
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
  if (!isTrustedRequestOrigin(req)) return apiError("FORBIDDEN");
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
        const body = await readRequestJson(req, { maxBytes: 384 * 1024 });
        const playlistId = requirePlaylistId(body.playlistId);
        const { action, value, email } = body;
        const existing = await Playlist.findById(playlistId);
        if (!existing) {
            return apiError("NOT_FOUND", { message: "Playlist not found" });
        }
        if (existing.user.toString() !== user._id.toString()) {
            return apiError("FORBIDDEN", {
                message: "Only the playlist owner can make this change",
            });
        }

        const changes = {};
        let collaborator;
        if (action === "details") {
            if (!value || typeof value !== "object" || Array.isArray(value)
                || !displayName(value.name, 80)
                || typeof value.description !== "string" || value.description.length > 300) {
                return apiError("VALIDATION_ERROR", { message: "Use a name between 1 and 80 characters and a description of up to 300 characters." });
            }
            changes.name = displayName(value.name, 80);
            changes.description = value.description.trim();
            if (value.coverImage !== undefined) changes.coverImage = await validatedCover(value.coverImage);
        } else if (action === "name") {
            if (!displayName(value, 80)) {
                return apiError("VALIDATION_ERROR", { message: "A playlist name between 1 and 80 characters is required" });
            }
            changes.name = displayName(value, 80);
        } else if (action === "pinned") {
            if (typeof value !== "boolean") {
                return apiError("VALIDATION_ERROR", { message: "Pinned must be true or false" });
            }
            changes.pinned = value;
        } else if (action === "smartShuffle") {
            if (typeof value !== "boolean") {
                return apiError("VALIDATION_ERROR", {
                    message: "Smart shuffle must be true or false",
                });
            }
            changes.smartShuffle = value;
        } else if (action === "visibility" && ["public", "private"].includes(value)) {
            changes.visibility = value;
        } else if (action === "category") {
            changes.category = normalizePlaylistCategory(value);
        } else if (action === "subgenre") {
            changes.subgenre = typeof value === "string" ? value.trim().slice(0, 48) : "";
        } else if (action === "cover") {
            changes.coverImage = await validatedCover(value == null ? "" : value);
        } else if (action === "addCollaborator") {
            const collaboratorEmail = typeof email === "string"
                ? email.trim().toLowerCase().slice(0, 254)
                : "";
            if (!collaboratorEmail) {
                return apiError("VALIDATION_ERROR", {
                    message: "A collaborator email is required",
                });
            }
            collaborator = await User.findOne({ email: collaboratorEmail });
            if (collaborator && collaborator._id.toString() === user._id.toString()) {
                return apiError("VALIDATION_ERROR", {
                    message: "You already own this playlist",
                });
            }
        } else {
            return apiError("VALIDATION_ERROR", {
                message: "Unsupported playlist update",
            });
        }

        const playlist = await mutateDocument(Playlist, playlistId, (current) => {
            if (String(current.user) !== String(user._id)) throw new ApiRouteError("FORBIDDEN");
            let fields = changes;
            if (action === "addCollaborator") {
                const collaborators = current.collaborators || [];
                if (!collaborator || collaborators.some((id) => String(id) === String(collaborator._id))) return null;
                if (collaborators.length >= MAX_COLLABORATORS) {
                    throw new ApiRouteError("VALIDATION_ERROR", { message: `A playlist can have up to ${MAX_COLLABORATORS} collaborators` });
                }
                fields = { collaborators: [...collaborators, collaborator._id] };
            }
            if (Object.entries(fields).every(([key, entry]) => current[key] === entry)) return null;
            return { ...fields, ...playlistItemChanges(current, getPlaylistItems(current)) };
        }, { user: user._id });
        await Playlist.populate(playlist, [
            { path: "user", select: "userName imageUrl" },
            { path: "collaborators", select: "userName imageUrl" },
        ]);
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
