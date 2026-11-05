import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
import { randomUUID } from "node:crypto";
import { knownDuration } from "@/utils/playlistDuration.mjs";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/utils/dbconnect";
import Playlist from "@/models/Playlist";
import { getSessionUser } from "@/utils/sessionAuth";
import { isRateLimited } from "@/utils/rateLimit";
import {
    ApiRouteError,
    apiError,
    handleApiError,
    readRequestJson,
} from "@/utils/apiResponse";
import { serializePlaylist } from "@/utils/playlistThemes";
import { canEditPlaylist, canViewPlaylist } from "@/utils/playlistAccess.mjs";
import { mutateDocument } from "@/utils/documentMutation.mjs";
import {
    getPlaylistItems, MAX_PLAYLIST_ITEMS, PLAYLIST_ENTRY_ID,
    playlistItemChanges, playlistRevision,
} from "@/utils/playlistItems.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireEntryId(value) {
    if (typeof value !== "string" || !PLAYLIST_ENTRY_ID.test(value)) {
        throw new ApiRouteError("VALIDATION_ERROR", { message: "A valid playlist entry is required" });
    }
    return value;
}

function expectedRevision(value, required = false) {
    if (value === undefined && !required) return undefined;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new ApiRouteError("VALIDATION_ERROR", { message: "A valid playlist revision is required" });
    }
    return value;
}

function checkRevision(playlist, expected) {
    if (expected !== undefined && playlistRevision(playlist) !== expected) {
        throw new ApiRouteError("CONFLICT", { message: "This playlist changed. Refresh it and try again." });
    }
}

function editGuard(user) {
    return { $or: [{ user: user._id }, { collaborators: user._id }] };
}

function requirePlaylistId(value) {
    if (typeof value !== "string" || !mongoose.isObjectIdOrHexString(value)) {
        throw new ApiRouteError("VALIDATION_ERROR", { message: "A valid playlist is required" });
    }
    return value;
}

function requireYoutubeId(value) {
    if (typeof value !== "string" || !YOUTUBE_ID_PATTERN.test(value)) {
        throw new ApiRouteError("VALIDATION_ERROR", {
            message: "A valid YouTube track is required",
        });
    }
    return value;
}

async function resolveUser(req, required = true) {
    const user = await getSessionUser(req);
    if (!user && required) {
        throw new ApiRouteError("UNAUTHORIZED", { message: "User not logged in" });
    }
    return user;
}

// add song to playlist
export async function POST(req){
  if (!isTrustedRequestOrigin(req)) return apiError("FORBIDDEN");
    try {
        const user = await resolveUser(req);
        const rateLimit = await isRateLimited(`playlist-songs:add:${user._id}`, {
            windowMs: 15 * 60_000,
            max: 120,
        });
        if (rateLimit.limited) {
            return apiError("RATE_LIMITED", {
                retryAfter: rateLimit.retryAfter,
                message: "Too many playlist song changes. Please wait before trying again.",
            });
        }
        const body = await readRequestJson(req);
        const playlistID = requirePlaylistId(body.playlistID);
        const song = requireYoutubeId(body.song);
        if (body.duration !== undefined && (typeof body.duration !== "number" || !knownDuration(body.duration))) return apiError("VALIDATION_ERROR");
        if (body.allowDuplicate !== undefined && typeof body.allowDuplicate !== "boolean") return apiError("VALIDATION_ERROR");
        if (body.requestId !== undefined && (typeof body.requestId !== "string" || !REQUEST_ID_PATTERN.test(body.requestId))) return apiError("VALIDATION_ERROR");
        const entryId = body.requestId?.toLowerCase() || randomUUID();
        const addedAt = new Date().toISOString();
        let duplicate = false;
        let added = false;
        await dbConnect();
        const playlist = await mutateDocument(Playlist, playlistID, (current) => {
            if (!canEditPlaylist(current, user)) throw new ApiRouteError("FORBIDDEN");
            const items = getPlaylistItems(current);
            const replay = items.find((item) => item.entryId === entryId);
            duplicate = false;
            added = false;
            if (replay) {
                if (replay.id !== song) throw new ApiRouteError("CONFLICT", { message: "This add request was already used for another track." });
                return null;
            }
            if (!body.allowDuplicate && items.some((item) => item.id === song)) {
                duplicate = true;
                return null;
            }
            if (items.length >= MAX_PLAYLIST_ITEMS) throw new ApiRouteError("VALIDATION_ERROR", { message: `A playlist can contain up to ${MAX_PLAYLIST_ITEMS} songs.` });
            added = true;
            return playlistItemChanges(current, [...items, { entryId, id: song, addedAt }], song, body.duration);
        }, editGuard(user));
        await Playlist.populate(playlist, [
            { path: "user", select: "userName imageUrl" },
            { path: "collaborators", select: "userName imageUrl" },
        ]);
        return NextResponse.json(
            {
                success: true,
                message: duplicate ? "This song is already in the playlist" : "Song added to playlist",
                duplicate,
                added,
                data: { playlist: serializePlaylist(playlist, user._id) },
            },
            { status: 200 }
        );
    } catch (e) {
        return handleApiError(e, "add playlist song");
    }
}


// delete song from playlist
export async function DELETE(req){
  if (!isTrustedRequestOrigin(req)) return apiError("FORBIDDEN");
    try {
        const user = await resolveUser(req);
        const rateLimit = await isRateLimited(`playlist-songs:delete:${user._id}`, {
            windowMs: 15 * 60_000,
            max: 120,
        });
        if (rateLimit.limited) {
            return apiError("RATE_LIMITED", {
                retryAfter: rateLimit.retryAfter,
                message: "Too many playlist song changes. Please wait before trying again.",
            });
        }
        const body = await readRequestJson(req);
        const playlistID = requirePlaylistId(body.playlistID);
        const entryId = body.entryId === undefined ? undefined : requireEntryId(body.entryId);
        const song = body.song === undefined && entryId ? undefined : requireYoutubeId(body.song);
        const revision = expectedRevision(body.expectedRevision);
        await dbConnect();
        const playlist = await mutateDocument(Playlist, playlistID, (current) => {
            if (!canEditPlaylist(current, user)) throw new ApiRouteError("FORBIDDEN");
            checkRevision(current, revision);
            const items = getPlaylistItems(current);
            const selected = entryId && items.find((item) => item.entryId === entryId);
            if (selected && song !== undefined && selected.id !== song) throw new ApiRouteError("CONFLICT", { message: "This playlist entry belongs to another track." });
            const remaining = items.filter((item) => entryId ? item.entryId !== entryId : item.id !== song);
            return remaining.length === items.length ? null : playlistItemChanges(current, remaining);
        }, editGuard(user));
        await Playlist.populate(playlist, [
            { path: "user", select: "userName imageUrl" },
            { path: "collaborators", select: "userName imageUrl" },
        ]);
        return NextResponse.json(
            {
                success: true,
                message: "Song deleted from playlist",
                data: playlist.songs,
                playlist: serializePlaylist(playlist, user._id),
            },
            { status: 200 }
        );
    } catch (e) {
        return handleApiError(e, "delete playlist song");
    }
}

// Move one occurrence in the saved order. A revision is required so a stale
// screen can never overwrite a concurrent add, remove, or reorder.
export async function PATCH(req) {
    if (!isTrustedRequestOrigin(req)) return apiError("FORBIDDEN");
    try {
        const user = await resolveUser(req);
        const limit = await isRateLimited(`playlist-songs:move:${user._id}`, { windowMs: 15 * 60_000, max: 120 });
        if (limit.limited) return apiError("RATE_LIMITED", { retryAfter: limit.retryAfter });
        const body = await readRequestJson(req);
        const playlistID = requirePlaylistId(body.playlistID);
        const entryId = requireEntryId(body.entryId);
        const beforeEntryId = body.beforeEntryId === null ? null : requireEntryId(body.beforeEntryId);
        const revision = expectedRevision(body.expectedRevision, true);
        await dbConnect();
        const playlist = await mutateDocument(Playlist, playlistID, (current) => {
            if (!canEditPlaylist(current, user)) throw new ApiRouteError("FORBIDDEN");
            checkRevision(current, revision);
            const items = getPlaylistItems(current);
            const selected = items.find((item) => item.entryId === entryId);
            if (!selected || (beforeEntryId !== null && !items.some((item) => item.entryId === beforeEntryId))) {
                throw new ApiRouteError("VALIDATION_ERROR", { message: "The selected playlist entry is unavailable." });
            }
            if (entryId === beforeEntryId) return null;
            const next = items.filter((item) => item.entryId !== entryId);
            const index = beforeEntryId === null ? next.length : next.findIndex((item) => item.entryId === beforeEntryId);
            next.splice(index, 0, selected);
            return next.every((item, position) => item.entryId === items[position].entryId)
                ? null : playlistItemChanges(current, next);
        }, editGuard(user));
        await Playlist.populate(playlist, [
            { path: "user", select: "userName imageUrl" },
            { path: "collaborators", select: "userName imageUrl" },
        ]);
        return NextResponse.json({ success: true, message: "Playlist order updated", data: { playlist: serializePlaylist(playlist, user._id) } });
    } catch (error) {
        return handleApiError(error, "move playlist song");
    }
}


// get songs of playlist
export async function GET(req){
    try {
        const { searchParams } = new URL(req.url);
        const playlistID = requirePlaylistId(searchParams.get("playlist"));
        await dbConnect();
        const user = await resolveUser(req, false);
        const playlist = await Playlist.findById(playlistID);
        if (!canViewPlaylist(playlist, user)) {
            return apiError("NOT_FOUND", { message: "This playlist is unavailable." });
        }
        await playlist.populate("user", "userName imageUrl");
        await playlist.populate("collaborators", "userName imageUrl");
        return NextResponse.json(
            {
                success: true,
                message: "Songs of playlist",
                data: serializePlaylist(playlist, user?._id)
            },
            { headers: { "Cache-Control": "private, no-store" } },
        );
    } catch (e) {
        return handleApiError(e, "get playlist songs");
    }
}
