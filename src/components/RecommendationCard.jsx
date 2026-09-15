"use client";

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { getSession, useSession } from "next-auth/react";
import { Undo2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { PiDotsThreeVerticalBold } from "react-icons/pi";
import { FiThumbsDown, FiClock, FiRadio, FiCornerDownRight, FiPlus } from "react-icons/fi";
import { addToQueue, playNextToQueue, startYoutubePlayback } from "@/redux/features/playerSlice";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { useJam } from "@/components/Jam/JamProvider";
import { useIsMobile } from "@/hooks/useMediaQuery";
import BottomSheet from "@/components/BottomSheet";
import MediaImage from "@/components/MediaImage";
import PlayFab from "@/components/PlayFab";
import { cleanArtist, cleanTitle } from "@/utils/text";

export default function RecommendationCard({ video, queue }) {
  const dispatch = useDispatch();
  const { data: session, status } = useSession();
  const jam = useJam();
  const isMobile = useIsMobile();
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
    const artist = cleanArtist(video.channel);
    const title = cleanTitle(video.title);
    const seedQuery = video.seedQuery || video.genre || [artist, title].filter(Boolean).join(" ");
    const radioTrack = {
      ...video,
      channel: artist || video.channel,
      seedQuery,
      genre: video.genre || artist || seedQuery,
    };
    dispatch(startYoutubePlayback({ queue: [radioTrack], track: radioTrack }));
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
      window.dispatchEvent(new Event("heykasa:preferences-changed"));
      toast((notification) => <div className="flex items-center gap-3">
        <span>{successMessage}</span>
        <button type="button" aria-label="Undo recommendation preference" title="Undo recommendation preference"
          className="grid h-12 w-12 shrink-0 place-items-center rounded hover:bg-black/10" onClick={async () => {
            toast.dismiss(notification.id);
            try {
              const current = await getSession();
              if (!session?.user?.id || current?.user?.id !== session.user.id) return;
              await requestJson(url, { method: "DELETE", body: { id: video.id } });
              window.dispatchEvent(new Event("heykasa:preferences-changed"));
            } catch (error) { toast.error(toUserError(error).message); }
          }}><Undo2 size={20} aria-hidden="true" /></button>
      </div>, { duration: 10_000 });
    } catch (error) {
      toast.error(toUserError(error).message);
    } finally {
      setBusy(false);
    }
  };

  const addToJam = () => {
    setMenuOpen(false);
    const added = jam?.enqueue?.(video);
    if (added) toast.success("Added to Jam queue");
    else toast("Already in the Jam queue");
  };

  const handlePlayNext = () => {
    setMenuOpen(false);
    dispatch(playNextToQueue(video));
    toast.success("Playing next");
  };

  const handleAddToQueue = () => {
    setMenuOpen(false);
    dispatch(addToQueue(video));
    toast.success("Added to queue");
  };

  const canModerate = status === "authenticated" && Boolean(video?.id);
  const canJam = Boolean(jam?.enqueue) && jam?.status === "connected" && Boolean(video?.id);
  const actions = [
    canJam && {
      key: "jam",
      Icon: FiRadio,
      label: "Add to Jam queue",
      accent: true,
      onClick: addToJam,
    },
    video?.id && {
      key: "play-next",
      Icon: FiCornerDownRight,
      label: "Play next",
      onClick: handlePlayNext,
    },
    video?.id && {
      key: "add-queue",
      Icon: FiPlus,
      label: "Add to queue",
      onClick: handleAddToQueue,
    },
    canModerate && {
      key: "not-interested",
      Icon: FiThumbsDown,
      label: "Not interested",
      onClick: () => savePreference("/api/notInterested", "We’ll show less like this"),
    },
    canModerate && {
      key: "snooze",
      Icon: FiClock,
      label: "Snooze for 7 days",
      onClick: () => savePreference("/api/snoozedTracks", "Snoozed for 7 days"),
    },
  ].filter(Boolean);
  const showMenu = actions.length > 0;

  if (dismissed) return null;

  const handleContextMenu = showMenu
    ? (event) => {
        // Desktop right-click (and Android long-press, which fires contextmenu)
        // open the same options menu instead of the native browser menu.
        event.preventDefault();
        setMenuOpen(true);
      }
    : undefined;

  const title = cleanTitle(video.title);
  const channel = cleanArtist(video.channel);

  return (
    <article className="card group relative w-full text-left" onContextMenu={handleContextMenu}>
      <button type="button" aria-label={`Play ${title}`} onClick={playVideo} className="relative aspect-video w-full overflow-hidden rounded-[4px] bg-black">
        <MediaImage src={video.thumbnail} size="hq" alt="" className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03] group-active:scale-[0.98]" />
        <PlayFab />
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
            className="grid min-h-11 min-w-11 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80 disabled:opacity-50"
          >
            <PiDotsThreeVerticalBold aria-hidden="true" />
          </button>
          {!isMobile && menuOpen ? (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div role="menu" className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-white/10 bg-[#07121d] py-1 text-sm shadow-2xl">
                {actions.map(({ key, Icon, label, accent, onClick }) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    onClick={onClick}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5 ${accent ? "text-[#00e6e6]" : "text-gray-200"}`}
                  >
                    <Icon aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {isMobile ? (
        <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} label="Track options">
          <p className="mb-2 line-clamp-1 px-1 text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">{title}</p>
          <div className="flex flex-col">
            {actions.map(({ key, Icon, label, accent, onClick }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] hover:bg-white/5 active:bg-white/10 ${accent ? "text-[#00e6e6]" : "text-gray-100"}`}
              >
                <Icon aria-hidden="true" className="shrink-0 text-lg" /> {label}
              </button>
            ))}
          </div>
        </BottomSheet>
      ) : null}
      <button type="button" onClick={playVideo} className="block w-full p-3 text-left">
        <p className="home-shelf-title mt-0">{title}</p>
        <div className="mt-2 flex items-center gap-2">
          {video.artistThumbnail ? (
            <MediaImage
              src={video.artistThumbnail}
              size="mq"
              alt=""
              className="h-5 w-5 shrink-0 rounded-full object-cover"
            />
          ) : null}
          <p className="truncate text-xs text-gray-400">{channel}</p>
        </div>
        <p className="mt-2 text-[11px] text-[#00e6e6]">{video.reason}</p>
      </button>
    </article>
  );
}
