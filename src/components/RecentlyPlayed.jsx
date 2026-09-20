"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useDispatch } from "react-redux";
import Link from "next/link";
import { requestJson } from "@/services/http";
import { accountOwner, readAccountCache, writeAccountCache } from "@/utils/accountCache.mjs";
import { HISTORY_CACHE, HISTORY_CHANGED, recentTracks, prependHistory } from "@/utils/recentActivity.mjs";
import { playHomeTracks } from "@/utils/playHome";
import ContextMenuTarget from "./ContextMenuTarget";
import AddToQueueButton from "./AddToQueueButton";
import MediaImage from "./MediaImage";

export default function RecentlyPlayed() {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  return <AccountHistory key={owner || status} owner={owner} status={status} />;
}

function AccountHistory({ owner, status }) {
  const dispatch = useDispatch();
  const [tracks, setTracks] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (status !== "authenticated") { setLoading(false); return; }
    const controller = new AbortController();
    const pendingChanges = [];
    setLoading(true); setError("");
    try { setTracks(recentTracks(readAccountCache(localStorage, HISTORY_CACHE, owner, 30 * 86400_000))); } catch {}
    const changed = (event) => {
      if (event.detail?.owner !== owner) return;
      pendingChanges.push(event.detail);
      if (event.detail.entry) setTracks((current) => prependHistory(current, event.detail.entry));
      if (event.detail.removedId) setTracks((current) => current.filter((track) => track.id !== event.detail.removedId));
    };
    window.addEventListener(HISTORY_CHANGED, changed);
    requestJson("/api/history", { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      let history = recentTracks(data.data);
      for (const change of pendingChanges) {
        if (change.entry) history = prependHistory(history, change.entry);
        if (change.removedId) history = history.filter((track) => track.id !== change.removedId);
      }
      setTracks(history);
      try { writeAccountCache(localStorage, HISTORY_CACHE, owner, history); } catch {}
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause?.message || "History could not sync. Try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); window.removeEventListener(HISTORY_CHANGED, changed); };
  }, [owner, status, retry]);
  const remove = async (track) => {
    if (track.source === "youtube" || /^[A-Za-z0-9_-]{11}$/.test(String(track.id))) await requestJson("/api/history", { method: "DELETE", body: { id: String(track.id) } });
    setTracks((current) => current.filter((item) => item.id !== track.id));
    try {
      const cached = recentTracks(readAccountCache(localStorage, HISTORY_CACHE, owner, 30 * 86400_000));
      writeAccountCache(localStorage, HISTORY_CACHE, owner, cached.filter((item) => item.id !== track.id));
    } catch {}
    window.dispatchEvent(new CustomEvent(HISTORY_CHANGED, { detail: { owner, removedId: track.id } }));
  };
  return <main className="page text-white">
    <header className="page-hero"><div><p className="eyebrow">Your listening history</p><h1 className="mt-2 text-3xl font-bold">Recently Played</h1><p className="mt-2 text-sm text-gray-400">Your last 100 songs, most recent first. Private sessions are not recorded.</p></div></header>
    {status === "loading" || loading ? <p role="status" className="py-8">Loading history…</p> : null}
    {status === "unauthenticated" ? <div className="py-8"><p>Log in to save and view your listening history across devices.</p><Link href="/login?callbackUrl=%2Frecently-played" className="btn-primary mt-4 inline-flex min-h-11 px-5">Log in</Link></div> : null}
    {error && <div role="alert" className="py-4 text-sm text-red-300">{error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-3 min-h-11 underline">Retry</button></div>}
    {status === "authenticated" && !loading && !error && tracks.length === 0 && <p className="py-8 text-gray-400">No listening history yet. Play a song to start your history.</p>}
    <ol className="mt-6 space-y-1" aria-label="Recently played songs">
      {tracks.map((track, index) => <ContextMenuTarget as="li" key={track.id} className="flex min-w-0 items-center gap-2 rounded-lg p-2 hover:bg-white/5">
        <button type="button" onClick={() => playHomeTracks(dispatch, tracks, index)} aria-label={`Play ${track.title || track.name}`} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <MediaImage src={track.thumbnail || track.image?.[0]?.url} size="mq" alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
          <span className="min-w-0"><span className="block break-words text-sm font-semibold">{track.title || track.name}</span><span className="block text-xs text-gray-400">{track.channel || track.primaryArtists || ""}</span></span>
        </button>
        <AddToQueueButton track={track} onRemove={() => remove(track)} removeLabel="Remove from Recently Played" />
      </ContextMenuTarget>)}
    </ol>
  </main>;
}
