"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { FiArrowLeft, FiClock, FiPlay } from "react-icons/fi";
import { playPause, setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";
import AddToQueueButton from "@/components/AddToQueueButton";
import MediaImage from "@/components/MediaImage";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { SongRowsSkeleton } from "@/components/Skeleton";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";
import { SITE_BRAND } from "@/utils/siteConfig";

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (!value) return "—";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export default function YouTubePlaylistPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const dispatch = useDispatch();
  const title = searchParams.get("title") || "Playlist";
  const thumbnail = searchParams.get("thumbnail") || "";
  const creator = searchParams.get("creator") || SITE_BRAND;
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    requestJson(`/api/youtube-playlist?id=${encodeURIComponent(id)}`, {
      signal: controller.signal,
      fallbackTitle: "Playlist unavailable",
      fallbackMessage: "We couldn’t load the songs in this playlist.",
    })
      .then((data) => setTracks(Array.isArray(data?.tracks) ? data.tracks : []))
      .catch((failure) => {
        if (!controller.signal.aborted) setError(toUserError(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);

  const seededTracks = useMemo(
    () => tracks.map((track) => ({ ...track, seedQuery: title, genre: title })),
    [title, tracks],
  );

  const playTrack = (track) => {
    dispatch(setYoutubeQueue(seededTracks));
    dispatch(setYoutubeVideo({ ...track, seedQuery: title, genre: title }));
    dispatch(playPause(true));
  };

  const playAll = () => {
    if (!seededTracks.length) return;
    dispatch(setYoutubeQueue(seededTracks));
    dispatch(setYoutubeVideo(seededTracks[0]));
    dispatch(playPause(true));
  };

  const unavailable = !loading && (
    Boolean(error)
    || (tracks.length === 0 && !searchParams.get("title"))
  );

  if (unavailable) {
    return (
      <div className="page text-gray-200">
        <EmptyState
          eyebrow="Playlist"
          title={error?.title || "This playlist page is unavailable"}
          message={error?.message || "Search for the playlist to open its songs in HeyKasa."}
          href="/"
          actionLabel="Back to Home"
        />
      </div>
    );
  }

  return (
    <main className="text-white">
      <section className="bg-[linear-gradient(180deg,rgba(0,230,230,0.22),rgba(7,18,29,0.94))] px-[3vw] pb-8 pt-6">
        <div className="mx-auto w-full max-w-[1440px]">
          <button type="button" onClick={() => router.back()} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-gray-300 hover:text-white">
            <FiArrowLeft /> Back to results
          </button>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <MediaImage src={thumbnail || tracks[0]?.thumbnail} size="hq" alt="" className="aspect-square w-44 shrink-0 rounded-md object-cover shadow-2xl sm:w-56" />
            <div className="min-w-0 pb-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white/70">Playlist</p>
              <h1 className="mt-3 break-words text-4xl font-black sm:text-5xl lg:text-6xl">{cleanTitle(title)}</h1>
              <p className="mt-4 text-sm text-gray-300">{cleanTitle(creator)} · {tracks.length} {tracks.length === 1 ? "song" : "songs"}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-[min(94%,1440px)] pb-12">
        <section className="flex items-center py-6" aria-label="Playlist actions">
          <button type="button" onClick={playAll} disabled={!tracks.length} aria-label={`Play ${title}`} className="play-fab play-fab--static h-14 w-14 min-h-14 min-w-14 disabled:opacity-40">
            <FiPlay className="ml-1 fill-current" />
          </button>
        </section>

        {loading && <SongRowsSkeleton />}
        {!loading && error && <UserMessage title={error.title} message={error.message} onRetry={() => location.reload()} />}
        {!loading && !error && tracks.length === 0 && <EmptyState title="This playlist is empty" message="No playable songs were found." />}

        {!loading && !error && tracks.length > 0 && (
          <section aria-label={`${title} songs`}>
            <div className="grid grid-cols-[44px_minmax(0,1fr)_52px_52px] items-center gap-2 border-b border-white/10 px-2 pb-2 text-xs uppercase text-gray-400">
              <span className="text-center">#</span><span>Title & artist</span><span className="text-center"><FiClock className="inline" /></span><span />
            </div>
            {seededTracks.map((track, index) => (
              <div key={track.id} className="group grid min-h-[66px] grid-cols-[44px_minmax(0,1fr)_52px_52px] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.075]">
                <button type="button" aria-label={`Play ${cleanTitle(track.title)}`} onClick={() => playTrack(track)} className="grid h-11 w-11 place-items-center rounded-full text-sm text-gray-400 hover:text-white">
                  <span className="group-hover:hidden">{index + 1}</span><FiPlay className="hidden fill-current group-hover:block" />
                </button>
                <button type="button" onClick={() => playTrack(track)} className="flex min-w-0 items-center gap-3 text-left">
                  <MediaImage src={track.thumbnail} size="mq" alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{cleanTitle(track.title)}</span><span className="mt-1 block truncate text-xs text-gray-400">{cleanTitle(track.channel)}</span></span>
                </button>
                <span className="text-right text-xs tabular-nums text-gray-400">{formatDuration(track.duration)}</span>
                <AddToQueueButton track={track} className="text-gray-400 hover:text-white" />
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
