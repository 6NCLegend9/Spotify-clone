import React from "react";
import { BsPlayFill } from "react-icons/bs";
import { useDispatch } from "react-redux";
import {
  playPause,
  setActiveSong,
  setFullScreen,
  setYoutubeQueue,
  setYoutubeVideo,
} from "@/redux/features/playerSlice";
import { BiHeadphone } from "react-icons/bi";
import { useSelector } from "react-redux";
import AddToQueueButton from "./AddToQueueButton";
import { THUMB_FALLBACK } from "@/utils/imageOptimize";
import { cleanTitle } from "@/utils/text";

const ListenAgainCard = ({ song, index, SongData }) => {
  const { activeSong, youtubeVideo } = useSelector((state) => state.player);
  const dispatch = useDispatch();
  const isYoutube = song?.source === "youtube";
  const isActive = isYoutube ? youtubeVideo?.id === song?.id : activeSong?.id === song?.id;

  const handlePlayClick = () => {
    if (isYoutube) {
      const queue = Array.isArray(SongData)
        ? SongData.filter((item) => item?.source === "youtube" && item?.id)
        : [song];
      dispatch(setYoutubeQueue(queue.length ? queue : [song]));
      dispatch(setYoutubeVideo(song));
      return;
    }
    dispatch(setActiveSong({ song, data: SongData, i: index }));
    dispatch(setFullScreen(true));
    dispatch(playPause(true));
  };

  const artistDisplay = isYoutube
    ? cleanTitle(song?.channel || "")
    : cleanTitle(
        (Array.isArray(song?.artists?.primary) &&
          song.artists.primary.map((artist) => artist?.name).join(", ")) ||
          (Array.isArray(song?.artists) &&
            song.artists.map((artist) => artist?.name).join(", ")) ||
          (Array.isArray(song?.artists?.all) &&
            song.artists.all.map((artist) => artist?.name).join(", ")) ||
          "",
      );

  const coverSrc = isYoutube
    ? song?.thumbnail || ""
    : song?.image?.[2]?.url || song?.image?.[1]?.url || song?.image?.[2]?.link || "";
  const titleDisplay = isYoutube ? cleanTitle(song?.title) : cleanTitle(song?.name);

  return (
    <div>
      <div
        className={`flex w-full items-center mt-5 border-b border-gray-400 justify-between gap-3 ${
          isActive ? " text-[#00e6e6]" : ""
        }`}
      >
        <button
          type="button"
          onClick={handlePlayClick}
          aria-label={`Play ${titleDisplay}`}
          className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          <div className=" relative mb-2">
            <div className="w-12 h-12 md:w-14 md:h-14 relative">
              <img
                src={coverSrc || THUMB_FALLBACK}
                alt=""
                width={50}
                height={50}
                onError={(event) => {
                  if (event.currentTarget.src !== THUMB_FALLBACK) {
                    event.currentTarget.src = THUMB_FALLBACK;
                  }
                }}
                className="rounded-lg object-cover w-12 h-12 md:w-14 md:h-14"
              />
            </div>
            {isActive ? (
              <BiHeadphone
                size={27}
                aria-hidden="true"
                className=" absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#00e6e6]"
              />
            ) : (
              <BsPlayFill
                size={25}
                aria-hidden="true"
                className=" opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-200"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm lg:text-lg font-semibold truncate">
              {titleDisplay}
            </p>
            <p className="text-gray-400 truncate text-xs">
              {artistDisplay}
            </p>
          </div>
        </button>
        {isYoutube && <AddToQueueButton track={song} />}
      </div>
    </div>
  );
};

export default ListenAgainCard;
