"use client";

import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { BiAddToQueue } from "react-icons/bi";
import { addToQueue, setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";

// Starts playback if nothing is currently playing, otherwise queues the track next.
export default function AddToQueueButton({ track, className = "" }) {
  const dispatch = useDispatch();
  const youtubeVideo = useSelector((state) => state.player.youtubeVideo);

  const handleClick = (event) => {
    event.stopPropagation();
    if (!track?.id) return;
    if (!youtubeVideo) {
      dispatch(setYoutubeQueue([track]));
      dispatch(setYoutubeVideo(track));
      return;
    }
    dispatch(addToQueue(track));
    toast.success("Added to queue");
  };

  return (
    <button
      type="button"
      aria-label="Add to queue"
      title="Add to queue"
      onClick={handleClick}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-gray-300 transition hover:bg-white/10 ${className}`}
    >
      <BiAddToQueue aria-hidden="true" />
    </button>
  );
}
