"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { FiChevronRight, FiMoreHorizontal, FiPlayCircle } from "react-icons/fi";
import { BiAddToQueue } from "react-icons/bi";
import {
  addToQueue,
  playNextToQueue,
  startYoutubePlayback,
} from "@/redux/features/playerSlice";

export default function TrackQueueMenu({ track, className = "", buttonLabel = "Track options" }) {
  const dispatch = useDispatch();
  const youtubeVideo = useSelector((state) => state.player.youtubeVideo);
  const youtubeQueue = useSelector((state) => state.player.youtubeQueue || []);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  if (!track?.id) return null;

  const startIfIdle = () => {
    if (youtubeVideo?.id) return false;
    dispatch(startYoutubePlayback({ queue: [track], track }));
    toast.success("Playing now");
    setOpen(false);
    return true;
  };

  const playNext = (event) => {
    event.stopPropagation();
    if (startIfIdle()) return;
    dispatch(playNextToQueue(track));
    toast.success("Playing next");
    setOpen(false);
  };

  const add = (event) => {
    event.stopPropagation();
    if (startIfIdle()) return;
    if (youtubeQueue.some((item) => item?.id === track.id)) {
      toast("Already in queue");
      setOpen(false);
      return;
    }
    dispatch(addToQueue(track));
    toast.success("Added to queue");
    setOpen(false);
  };

  return (
    <span ref={rootRef} className={`relative inline-flex shrink-0 ${className}`} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-gray-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <FiMoreHorizontal aria-hidden="true" />
      </button>
      {open ? (
        <span
          role="menu"
          className="absolute right-0 top-11 z-[80] w-48 overflow-hidden rounded-lg border border-[var(--hairline-cyan)] bg-[var(--navy-raised)] p-1.5 text-left text-sm text-white shadow-2xl"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={playNext} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-[var(--navy-panel)]">
            <FiPlayCircle aria-hidden="true" className="text-[var(--accent)]" />
            <span className="flex-1">Play next</span>
            <FiChevronRight aria-hidden="true" className="opacity-40" />
          </button>
          <button type="button" role="menuitem" onClick={add} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-[var(--navy-panel)]">
            <BiAddToQueue aria-hidden="true" className="text-[var(--accent)]" />
            <span>Add to queue</span>
          </button>
        </span>
      ) : null}
    </span>
  );
}
