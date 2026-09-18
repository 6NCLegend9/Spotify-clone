import mongoose from "mongoose";
import dbConnect from "@/utils/dbconnect";
import Playlist from "@/models/Playlist";
import { isYoutubeVideoId } from "@/utils/youtubeComments.mjs";
import { youtubeShareArt } from "@/utils/shareCard.mjs";

const EMBED_TRACK_LIMIT = 8;

export async function loadPublicPlaylistShare(playlistId) {
  const id = String(playlistId || "").trim();
  if (!mongoose.isObjectIdOrHexString(id)) return null;
  await dbConnect();
  const playlist = await Playlist.findById(id).select("name songs visibility").lean();
  if (!playlist || playlist.visibility !== "public") return null;
  const songs = (Array.isArray(playlist.songs) ? playlist.songs : []).filter(isYoutubeVideoId);
  return {
    id: String(playlist._id),
    name: String(playlist.name || "Playlist").trim().slice(0, 120) || "Playlist",
    songs: songs.slice(0, EMBED_TRACK_LIMIT),
    songCount: songs.length,
    image: youtubeShareArt(songs[0]),
  };
}
