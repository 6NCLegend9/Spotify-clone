"use client";

import { useDispatch } from "react-redux";
import { setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";

export default function RecommendationCard({ video, queue }) {
  const dispatch = useDispatch();
  const playVideo = () => {
    const seedQuery = video.seedQuery || video.genre;
    const seededQueue = (queue || []).map((item) => ({
      ...item,
      seedQuery: item.seedQuery || item.genre || seedQuery,
      genre: item.genre || video.genre,
    }));
    dispatch(setYoutubeQueue(seededQueue));
    dispatch(setYoutubeVideo({ ...video, seedQuery, genre: video.genre || seedQuery }));
  };

  return (
    <article className="card group w-full text-left">
      <button type="button" aria-label={`Play ${video.title}`} onClick={playVideo} className="relative aspect-video w-full overflow-hidden bg-black">
        <img src={video.thumbnail} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      </button>
      <button type="button" onClick={playVideo} className="block w-full p-4 text-left">
        <p className="line-clamp-2 text-sm font-semibold text-white">{video.title}</p>
        <p className="mt-2 truncate text-xs text-gray-400">{video.channel}</p>
        <p className="mt-2 text-[11px] text-[#00e6e6]">{video.reason}</p>
      </button>
    </article>
  );
}
