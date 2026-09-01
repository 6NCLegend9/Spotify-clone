"use client";

import { useState } from "react";
import { useDispatch } from "react-redux";
import { setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";
import toast from "react-hot-toast";
import MediaImage from "@/components/MediaImage";

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
      const seeded = tracks.map((track) => ({
        ...track,
        seedQuery: playlist.title,
        genre: playlist.title,
      }));
      dispatch(setYoutubeQueue(seeded));
      dispatch(setYoutubeVideo(seeded[0]));
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
        <MediaImage
          src={playlist.thumbnail}
          size="hq"
          alt=""
          className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03] group-active:scale-[0.98]"
        />
      </div>
      <div className="p-4">
        <p className="line-clamp-2 text-sm font-semibold text-white">{playlist.title}</p>
        <p className="mt-2 truncate text-xs text-gray-400">{playlist.channel}</p>
      </div>
    </button>
  );
}

