import { NextResponse } from "next/server";
import User from "@/models/User";
import dbConnect from "@/utils/dbconnect";
import Playlist from "@/models/Playlist";
import auth from "@/utils/auth";
import { serializePlaylist } from "@/utils/playlistThemes";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function canEditPlaylist(playlist, user) {
    if (!user) return false;
    const userId = user._id.toString();
    return playlist.user.toString() === userId ||
        playlist.collaborators?.some((id) => id.toString() === userId);
}

// add song to playlist
export async function POST(req){
    const { playlistID, song } = await req.json();
    if (typeof song !== "string" || !YOUTUBE_ID_PATTERN.test(song)) {
        return NextResponse.json(
            { success: false, message: "A valid YouTube track is required", data: null },
            { status: 400 }
        );
    }
    try {
        const user = await auth(req);
        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message: "User not logged in",
                    data: null
                },
                { status: 404 }
            );
        }
        await dbConnect();
        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message: "User not found",
                    data: null
                },
                { status: 404 }
            );
        }
        const playlist = await Playlist.findById(playlistID);
        if (!playlist) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Playlist not found",
                    data: null
                },
                { status: 404 }
            );
        }
        if (!canEditPlaylist(playlist, user)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "You don't have permission to change this playlist.",
                    data: null
                },
                { status: 401 }
            );
        }
        // check if song already exists in playlist
        const songExists = playlist.songs.find((s) => s === song);
        if (songExists) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Song already exists in playlist",
                    data: null
                },
                { status: 400 }
            );
        }
        playlist.songs.push(song);
        playlist.songAddedAt?.set(song, new Date());
        await playlist.save();
        return NextResponse.json(
            {
                success: true,
                message: "Song added to playlist",
                data: null
            },
            { status: 200 }
        );
    } catch (e) {
        console.error(e);
        return NextResponse.json(
            {
                success: false,
                message: "Something went wrong",
                data: null
            },
            { status: 500 }
        );
    }
}


// delete song from playlist
export async function DELETE(req){
    const { playlistID, song } = await req.json();
    try {
        const user = await auth(req);
        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message: "User not logged in",
                    data: null
                },
                { status: 404 }
            );
        }
        await dbConnect();
        const playlist = await Playlist.findById(playlistID);
        if (!playlist) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Playlist not found",
                    data: null
                },
                { status: 404 }
            );
        }
        if (!canEditPlaylist(playlist, user)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "You don't have permission to change this playlist.",
                    data: null
                },
                { status: 401 }
            );
        }
        // check if song exists in playlist
        const songExists = playlist.songs.find((s) => s === song);
        if (!songExists) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Song does not exist in playlist",
                    data: null
                },
                { status: 400 }
            );
        }
        playlist.songs = playlist.songs.filter((songId) => songId !== song);
        playlist.songAddedAt?.delete(song);
        await playlist.save();
        return NextResponse.json(
            {
                success: true,
                message: "Song deleted from playlist",
                data: playlist.songs
            },
            { status: 200 }
        );
    } catch (e) {
        console.error(e);
        return NextResponse.json(
            {
                success: false,
                message: "Something went wrong",
                data: null
            },
            { status: 500 }
        );
    }
}


// get songs of playlist
export async function GET(req){
    const { searchParams } = new URL(req.url);
    const playlistID = searchParams.get("playlist");
    // console.log('playlistID', playlistID);
    // console.log('searchParams', searchParams);
    try {
        await dbConnect();
        const user = await auth(req);
        const playlist = await Playlist.findById(playlistID);
        if (!playlist) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Playlist not found",
                    data: null
                },
                { status: 404 }
            );
        }
        if (playlist.visibility !== "public" && !canEditPlaylist(playlist, user)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "This playlist is private. Ask the owner for access.",
                    data: null
                },
                { status: 403 }
            );
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
        console.error(e);
        return NextResponse.json(
            {
                success: false,
                message: "Something went wrong",
                data: null
            },
            { status: 500 }
        );
    }
}