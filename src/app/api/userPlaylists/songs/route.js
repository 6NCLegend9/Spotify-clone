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
import { boundedMembership, dateMapForMembers, mutateDocument } from "@/utils/documentMutation.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_PLAYLIST_SONGS = 500;

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
        await dbConnect();
        await mutateDocument(Playlist, playlistID, (current) => {
            if (!canEditPlaylist(current, user)) throw new ApiRouteError("FORBIDDEN");
            const songs = boundedMembership(current.songs, song, true, MAX_PLAYLIST_SONGS);
            return { songs, songAddedAt: dateMapForMembers(songs, current.songAddedAt, song) };
        }, { $or: [{ user: user._id }, { collaborators: user._id }] });
        return NextResponse.json(
            {
                success: true,
                message: "Song added to playlist",
                data: null
            },
            { status: 200 }
        );
    } catch (e) {
        return handleApiError(e, "add playlist song");
    }
}


// delete song from playlist
export async function DELETE(req){
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
        const song = requireYoutubeId(body.song);
        await dbConnect();
        const playlist = await mutateDocument(Playlist, playlistID, (current) => {
            if (!canEditPlaylist(current, user)) throw new ApiRouteError("FORBIDDEN");
            const songs = boundedMembership(current.songs, song, false, MAX_PLAYLIST_SONGS);
            return { songs, songAddedAt: dateMapForMembers(songs, current.songAddedAt) };
        }, { $or: [{ user: user._id }, { collaborators: user._id }] });
        return NextResponse.json(
            {
                success: true,
                message: "Song deleted from playlist",
                data: playlist.songs
            },
            { status: 200 }
        );
    } catch (e) {
        return handleApiError(e, "delete playlist song");
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
        if (!playlist) {
            return apiError("NOT_FOUND", { message: "Playlist not found" });
        }
        if (!canViewPlaylist(playlist, user)) {
            const code = user ? "FORBIDDEN" : "UNAUTHORIZED";
            return apiError(code, {
                message: user
                    ? "This playlist is private. Ask the owner for access."
                    : "User not logged in",
            });
        }
        await playlist.populate("user", "userName imageUrl");
        await playlist.populate("collaborators", "userName imageUrl");
        return NextResponse.json(
            {
                success: true,
                message: "Songs of playlist",
                data: serializePlaylist(playlist, user?._id)
            },
            { status: 200 }
        );
    } catch (e) {
        return handleApiError(e, "get playlist songs");
    }
}