"use client";

import { useDispatch } from "react-redux";
import { FiX } from "react-icons/fi";
import { setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";
import FavouriteTrackButton from "./FavouriteTrackButton";
import AddToPlaylistButton from "./AddToPlaylistButton";
import AddToQueueButton from "./AddToQueueButton";

export default function RecommendationCard({ video, queue, onDismiss }) {
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
      <div className="relative aspect-video overflow-hidden bg-black">
        <button type="button" aria-label={`Play ${video.title}`} onClick={playVideo} className="h-full w-full">
          <img src={video.thumbnail} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <span className="absolute bottom-3 left-3 rounded-full bg-[#00e6e6] px-3 py-1 text-xs font-bold text-black">Play</span>
        </button>
        <div className="absolute right-2 top-2 flex gap-1">
          <AddToQueueButton track={video} className="bg-black/70 text-white backdrop-blur" />
          <AddToPlaylistButton track={video} className="bg-black/70 text-white backdrop-blur" />
          <FavouriteTrackButton track={video} className="bg-black/70 text-white backdrop-blur" />
          {onDismiss && (
            <button
              type="button"
              aria-label="Not interested"
              title="Not interested"
              onClick={(event) => {
                event.stopPropagation();
                onDismiss(video.id);
              }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/70 text-white backdrop-blur transition hover:bg-white/10"
            >
              <FiX />
            </button>
          )}
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
