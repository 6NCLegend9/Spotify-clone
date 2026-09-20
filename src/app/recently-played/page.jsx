"use client";

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { FiClock, FiMoreHorizontal, FiTrash2 } from "react-icons/fi";
import BottomSheet from "@/components/BottomSheet";
import MediaImage from "@/components/MediaImage";
import { requestJson } from "@/services/http";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { cleanArtist, cleanTitle } from "@/utils/text";

export default function RecentlyPlayedPage() {
  const dispatch = useDispatch();
  const isMobile = useIsMobile();
  const [tracks, setTracks] = useState([]);
  const [menuTrack, setMenuTrack] = useState(null);

  useEffect(() => {
    requestJson("/api/history").then((json) => setTracks(Array.isArray(json?.data) ? json.data.slice(0, 100) : [])).catch(() => setTracks([]));
  }, []);

  const play = (track) => dispatch(startYoutubePlayback({
    queue: tracks,
    track,
    queueMode: "collection",
    autoExtend: false,
    context: { type: "history", id: "recently-played", name: "Recently Played" },
  }));

  const remove = async (track) => {
    const previous = tracks;
    setTracks((items) => items.filter((item) => item.id !== track.id));
    setMenuTrack(null);
    try {
      await requestJson("/api/history", { method: "DELETE", body: { id: track.id } });
    } catch {
      setTracks(previous);
    }
  };

  const openMenu = (event, track) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuTrack(track);
  };

  return (
    <main className="page text-white">
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#64c9d7]"><FiClock /> History</div>
        <h1 className="text-3xl font-bold sm:text-4xl">Recently Played</h1>
        <p className="mt-2 text-sm text-gray-400">Your latest {Math.min(tracks.length, 100)} played tracks.</p>
      </header>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#07121d]/70">
        {tracks.map((track, index) => (
          <div key={track.id} onContextMenu={(event) => openMenu(event, track)} className="group flex min-w-0 items-center gap-3 border-b border-white/5 px-3 py-2 last:border-0 hover:bg-white/5">
            <span className="w-6 shrink-0 text-right text-xs text-gray-500">{index + 1}</span>
            <button type="button" onClick={() => play(track)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <MediaImage src={track.thumbnail || ""} size="mq" alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold sm:text-[15px]">{cleanTitle(track.title || track.name, "Track")}</span>
                <span className="block truncate text-xs text-gray-400">{cleanArtist(track.channel || track.artist || "")}</span>
              </span>
            </button>
            <button type="button" aria-label="More options" onClick={(event) => openMenu(event, track)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-300 hover:bg-white/10"><FiMoreHorizontal /></button>
          </div>
        ))}
        {!tracks.length ? <p className="px-5 py-12 text-center text-sm text-gray-400">Play some music and it will appear here.</p> : null}
      </div>

      {menuTrack && !isMobile ? (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuTrack(null)} />
          <div role="menu" className="fixed right-8 top-24 z-50 w-56 rounded-lg border border-white/10 bg-[#07121d] p-1 shadow-2xl">
            <button type="button" role="menuitem" onClick={() => remove(menuTrack)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-white/5"><FiTrash2 /> Remove from history</button>
          </div>
        </>
      ) : null}
      {isMobile ? (
        <BottomSheet open={Boolean(menuTrack)} onClose={() => setMenuTrack(null)} label="Recently played options">
          {menuTrack ? <button type="button" onClick={() => remove(menuTrack)} className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-red-300 hover:bg-white/5"><FiTrash2 /> Remove from history</button> : null}
        </BottomSheet>
      ) : null}
    </main>
  );
}
