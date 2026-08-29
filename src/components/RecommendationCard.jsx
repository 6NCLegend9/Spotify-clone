"use client";

import { useDispatch } from "react-redux";
import { setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";
import FavouriteTrackButton from "./FavouriteTrackButton";
import AddToPlaylistButton from "./AddToPlaylistButton";

export default function RecommendationCard({ video, queue }) {
  const dispatch = useDispatch();
  const playVideo = () => {
    dispatch(setYoutubeQueue(queue));
    dispatch(setYoutubeVideo(video));
  };

  return (
    <article className="group w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-left transition hover:-translate-y-1 hover:border-[#00e6e6]/50 hover:bg-white/[0.08]">
      <div className="relative aspect-video overflow-hidden bg-black">
        <button type="button" aria-label={`Play ${video.title}`} onClick={playVideo} className="h-full w-full">
          <img src={video.thumbnail} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <span className="absolute bottom-3 left-3 rounded-full bg-[#00e6e6] px-3 py-1 text-xs font-bold text-black">Play</span>
        </button>
        <div className="absolute right-2 top-2 flex gap-1">
          <AddToPlaylistButton track={video} className="bg-black/70 text-white backdrop-blur" />
          <FavouriteTrackButton track={video} className="bg-black/70 text-white backdrop-blur" />
        </div>
      </div>
      <button type="button" onClick={playVideo} className="block w-full p-4 text-left">
        <p className="line-clamp-2 text-sm font-semibold text-white">{video.title}</p>
        <p className="mt-2 truncate text-xs text-gray-400">{video.channel}</p>
        <p className="mt-2 text-[11px] text-[#00e6e6]">{video.reason}</p>
      </button>
    </article>
  );
}
