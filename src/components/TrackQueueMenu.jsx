"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { FiChevronRight, FiMoreHorizontal, FiPlayCircle } from "react-icons/fi";
import { BiAddToQueue } from "react-icons/bi";
import {
  addToQueue,
  playNextToQueue,
  startYoutubePlayback,
} from "@/redux/features/playerSlice";

const MENU_WIDTH = 192;
const MENU_HEIGHT = 104;

export default function TrackQueueMenu({ track, className = "", buttonLabel = "Track options" }) {
  const dispatch = useDispatch();
  const youtubeVideo = useSelector((state) => state.player.youtubeVideo);
  const youtubeQueue = useSelector((state) => state.player.youtubeQueue || []);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.max(8, Math.min(window.innerWidth - MENU_WIDTH - 8, rect.right - MENU_WIDTH));
      const below = rect.bottom + 6;
      const top = below + MENU_HEIGHT <= window.innerHeight - 8
        ? below
        : Math.max(8, rect.top - MENU_HEIGHT - 6);
      setPosition({ top, left });
    };
    const close = (event) => {
      if (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    place();
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
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

  const menu = open && typeof document !== "undefined" ? createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Queue actions for ${track.title || "track"}`}
      style={{ position: "fixed", top: position.top, left: position.left, width: MENU_WIDTH }}
      className="z-[120] overflow-hidden rounded-lg border border-[var(--hairline-cyan)] bg-[var(--navy-raised)] p-1.5 text-left text-sm text-white shadow-2xl"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={playNext} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-[var(--navy-panel)] focus:bg-[var(--navy-panel)] focus:outline-none">
        <FiPlayCircle aria-hidden="true" className="text-[var(--accent)]" />
        <span className="flex-1">Play next</span>
        <FiChevronRight aria-hidden="true" className="opacity-40" />
      </button>
      <button type="button" role="menuitem" onClick={add} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-[var(--navy-panel)] focus:bg-[var(--navy-panel)] focus:outline-none">
        <BiAddToQueue aria-hidden="true" className="text-[var(--accent)]" />
        <span>Add to queue</span>
      </button>
    </div>,
    document.body,
  ) : null;

  return (
    <span ref={rootRef} className={`relative inline-flex shrink-0 ${className}`} onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
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
      {menu}
    </span>
  );
}
