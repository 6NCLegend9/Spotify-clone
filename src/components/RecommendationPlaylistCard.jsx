"use client";

import { useState } from "react";
import { useDispatch } from "react-redux";
import { setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";
import toast from "react-hot-toast";

export default function RecommendationPlaylistCard({ playlist }) {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);

  const playPlaylist = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/youtube-playlist?id=${playlist.id}`);
      const data = response.ok ? await response.json() : null;
      const tracks = data?.tracks || [];
      if (tracks.length === 0) {
        toast.error("This playlist has no playable videos.");
        return;
      }
      dispatch(setYoutubeQueue(tracks));
      dispatch(setYoutubeVideo(tracks[0]));
    } catch (error) {
      toast.error("Could not load this playlist.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={playPlaylist}
      disabled={loading}
      className="card group block w-full text-left disabled:opacity-60"
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        <img
          src={playlist.thumbnail}
          alt=""
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <span className="absolute bottom-3 left-3 rounded-full bg-[#00e6e6] px-3 py-1 text-xs font-bold text-black">
          {loading ? "Loading..." : "Play"}
        </span>
      </div>
      <div className="p-4">
        <p className="line-clamp-2 text-sm font-semibold text-white">{playlist.title}</p>
        <p className="mt-2 truncate text-xs text-gray-400">{playlist.channel}</p>
      </div>
    </button>
  );
}

