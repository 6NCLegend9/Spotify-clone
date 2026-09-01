import { NextResponse } from "next/server";
import dbConnect from "@/utils/dbconnect";
import Playlist from "@/models/Playlist";
import UserData from "@/models/UserData";
import auth from "@/utils/auth";
import { serializePlaylist } from "@/utils/playlistThemes";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const playlistId = typeof body?.playlistId === "string" ? body.playlistId : "";
  if (!playlistId) {
    return NextResponse.json(
      { success: false, message: "A playlist is required.", data: null },
      { status: 400 },
    );
  }

  try {
    await dbConnect();
    const user = await auth(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Log in to like playlists.", data: null },
        { status: 401 },
      );
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
      return NextResponse.json(
        { success: false, message: "This playlist could not be found.", data: null },
        { status: 404 },
      );
    }

    const isOwner = playlist.user.toString() === user._id.toString();
    const isCollaborator = playlist.collaborators?.some((id) => id.toString() === user._id.toString());
    if (playlist.visibility !== "public" && !isOwner && !isCollaborator) {
      return NextResponse.json(
        { success: false, message: "This playlist is private.", data: null },
        { status: 403 },
      );
    }

    const alreadyLiked = (playlist.likedBy || []).some((id) => id.toString() === user._id.toString());
    if (alreadyLiked) {
      playlist.likedBy = (playlist.likedBy || []).filter((id) => id.toString() !== user._id.toString());
    } else {
      playlist.likedBy = [...(playlist.likedBy || []), user._id];
    }
    await playlist.save();

    const userData = await UserData.findById(user.userData);
    if (userData) {
      if (alreadyLiked) {
        userData.likedPlaylists = (userData.likedPlaylists || []).filter(
          (id) => id.toString() !== playlistId,
        );
      } else if (!(userData.likedPlaylists || []).some((id) => id.toString() === playlistId)) {
        userData.likedPlaylists = [...(userData.likedPlaylists || []), playlist._id];
      }
      await userData.save();
    }

    const serialized = serializePlaylist(playlist, user._id);
    return NextResponse.json({
      success: true,
      message: alreadyLiked ? "Removed from liked playlists" : "Added to liked playlists",
      data: serialized,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "We couldn't update that like. Please try again.", data: null },
      { status: 500 },
    );
  }
}
