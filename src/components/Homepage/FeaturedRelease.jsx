"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { BsPlayFill } from "react-icons/bs";
import { PiDotsThreeVerticalBold } from "react-icons/pi";
import { FiPlus, FiCornerDownRight } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { addToQueue, playNextToQueue } from "@/redux/features/playerSlice";
import MediaImage from "@/components/MediaImage";
import AddToPlaylistButton from "@/components/AddToPlaylistButton";
import BottomSheet from "@/components/BottomSheet";
import { playHomeTracks } from "@/utils/playHome";
import { cleanTitle } from "@/utils/text";
import { useIsMobile } from "@/hooks/useMediaQuery";

const MENU_WIDTH = 192;

export default function FeaturedRelease({ video, queue }) {
  const dispatch = useDispatch();
  const isMobile = useIsMobile();
  const { youtubeVideo } = useSelector((state) => state.player);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const menuButtonRef = useRef(null);

  useLayoutEffect(() => {
    if (!menuOpen || isMobile || !menuButtonRef.current) return undefined;
    const place = () => {
      const rect = menuButtonRef.current.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, rect.right - MENU_WIDTH),
        window.innerWidth - MENU_WIDTH - 8,
      );
      const menuHeight = 104;
      const below = rect.bottom + 6;
      const top =
        below + menuHeight > window.innerHeight - 8
          ? Math.max(8, rect.top - menuHeight - 6)
          : below;
      setMenuPos({ top, left });
    };
    place();
    const scroller = document.getElementById("main-content");
    scroller?.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      scroller?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [menuOpen, isMobile]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (!video?.id) return null;

  const title = cleanTitle(video.title, "New release");
  const artist = cleanTitle(video.channel, "Artist");
  const kind = video.kind || video.type || "Single";

  const play = () => playHomeTracks(dispatch, queue?.length ? queue : [video], 0);

  const actions = [
    {
      key: "play-next",
      Icon: FiCornerDownRight,
      label: "Play next",
      onClick: () => {
        setMenuOpen(false);
        dispatch(playNextToQueue(video));
        toast.success("Playing next");
      },
    },
    {
      key: "queue",
      Icon: FiPlus,
      label: "Add to queue",
      onClick: () => {
        setMenuOpen(false);
        dispatch(addToQueue(video));
        toast.success("Added to queue");
      },
    },
  ];

  return (
    <section className="home-feature">
      <div className="mb-3 flex items-center gap-3">
        {video.artistThumbnail ? (
          <MediaImage
            src={video.artistThumbnail}
            size="mq"
            alt=""
            className="h-10 w-10 rounded-full object-cover ring-1 ring-[#00e6e6]/35 sm:h-12 sm:w-12"
          />
        ) : (
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#00e6e6]/20 text-sm font-bold text-[#00e6e6] sm:h-12 sm:w-12">
            {artist.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#9aa8b5]">
            New release from
          </p>
          <p className="truncate text-base font-bold text-white sm:text-lg">{artist}</p>
        </div>
      </div>

      <article className="home-feature-card">
        <button type="button" onClick={play} aria-label={`Play ${title}`} className="shrink-0">
          <MediaImage
            src={video.thumbnail}
            size="hq"
            alt=""
            className="home-feature-art"
          />
        </button>
        <div className="home-feature-meta">
          <div className="flex items-start gap-1">
            <button type="button" onClick={play} className="min-w-0 flex-1 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9aa8b5]">
                {kind}
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-bold text-white sm:text-base">{title}</p>
              <p className="mt-1 line-clamp-1 text-xs text-[#9aa8b5]">{artist}</p>
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="More options"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/10"
            >
              <PiDotsThreeVerticalBold aria-hidden="true" className="text-xl" />
            </button>
          </div>
          <div className="mt-auto flex items-center justify-between pt-3">
            <AddToPlaylistButton
              track={video}
              className="grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10"
            />
            <button
              type="button"
              onClick={play}
              aria-label={youtubeVideo?.id === video.id ? `Playing ${title}` : `Play ${title}`}
              className="home-feature-play sm:h-12 sm:w-12"
            >
              <BsPlayFill aria-hidden="true" className="text-2xl" />
            </button>
          </div>
        </div>
      </article>

      {isMobile ? (
        <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} label="Release options">
          <div className="flex flex-col">
            {actions.map(({ key, Icon, label, onClick }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-gray-100 hover:bg-white/5"
              >
                <Icon aria-hidden="true" className="text-lg" /> {label}
              </button>
            ))}
          </div>
        </BottomSheet>
      ) : menuOpen && typeof document !== "undefined"
        ? createPortal(
          <>
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-[80] cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="menu"
              className="glass-panel fixed z-[81] w-48 overflow-hidden rounded-xl py-1 text-sm"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {actions.map(({ key, Icon, label, onClick }) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  onClick={onClick}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-200 hover:bg-white/5"
                >
                  <Icon aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )
        : null}
    </section>
  );
}
