"use client";

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";
import { PiDotsThreeVerticalBold } from "react-icons/pi";
import { FiThumbsDown, FiClock, FiRadio } from "react-icons/fi";
import { setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { useJam } from "@/components/Jam/JamProvider";
import MediaImage from "@/components/MediaImage";

export default function RecommendationCard({ video, queue }) {
  const dispatch = useDispatch();
  const { status } = useSession();
  const jam = useJam();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

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

  const savePreference = async (url, successMessage) => {
    if (busy || !video?.id) return;
    setBusy(true);
    setMenuOpen(false);
    try {
      await requestJson(url, {
        method: "POST",
        body: { id: video.id },
        fallbackTitle: "Preference couldn’t be saved",
        fallbackMessage: "Please try again in a moment.",
      });
      setDismissed(true);
      toast.success(successMessage);
    } catch (error) {
      toast.error(toUserError(error).message);
    } finally {
      setBusy(false);
    }
  };

  const addToJam = () => {
    setMenuOpen(false);
    jam?.enqueue?.(video);
    toast.success("Added to Jam queue");
  };

  const canModerate = status === "authenticated" && Boolean(video?.id);
  const canJam = Boolean(jam?.enqueue) && jam?.status === "connected" && Boolean(video?.id);
  const showMenu = canModerate || canJam;

  if (dismissed) return null;

  return (
    <article className="card group relative w-full text-left">
      <button type="button" aria-label={`Play ${video.title}`} onClick={playVideo} className="relative aspect-video w-full overflow-hidden bg-black">
        <MediaImage src={video.thumbnail} size="hq" alt="" className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03] group-active:scale-[0.98]" />
      </button>
      {showMenu ? (
        <div className="absolute right-2 top-2 z-20">
          <button
            type="button"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid min-h-9 min-w-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80 disabled:opacity-50"
          >
            <PiDotsThreeVerticalBold aria-hidden="true" />
          </button>
          {menuOpen ? (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div role="menu" className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-white/10 bg-[#07121d] py-1 text-sm shadow-2xl">
                {canJam ? (
                  <button type="button" role="menuitem" onClick={addToJam} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[#00e6e6] hover:bg-white/5">
                    <FiRadio aria-hidden="true" /> Add to Jam queue
                  </button>
                ) : null}
                {canModerate ? (
                  <>
                    <button type="button" role="menuitem" onClick={() => savePreference("/api/notInterested", "We’ll show less like this")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-200 hover:bg-white/5">
                      <FiThumbsDown aria-hidden="true" /> Not interested
                    </button>
                    <button type="button" role="menuitem" onClick={() => savePreference("/api/snoozedTracks", "Snoozed for now")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-200 hover:bg-white/5">
                      <FiClock aria-hidden="true" /> Snooze
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <button type="button" onClick={playVideo} className="block w-full p-4 text-left">
        <p className="line-clamp-2 text-sm font-semibold text-white">{video.title}</p>
        <p className="mt-2 truncate text-xs text-gray-400">{video.channel}</p>
        <p className="mt-2 text-[11px] text-[#00e6e6]">{video.reason}</p>
      </button>
    </article>
  );
}
