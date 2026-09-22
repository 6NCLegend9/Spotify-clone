"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { FiArrowLeft, FiClock, FiLink, FiPlay } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import AddToQueueButton from "@/components/AddToQueueButton";
import MediaImage from "@/components/MediaImage";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { SongRowsSkeleton } from "@/components/Skeleton";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanArtist, cleanTitle } from "@/utils/text";
import { collectionPlayback, mergePlaylistTracks } from "@/utils/discoveryPlaylist.mjs";
import { SITE_BRAND, SITE_URL } from "@/utils/siteConfig";

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (!value) return "—";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export default function DiscoveryPlaylist({ id, title: initialTitle = "Playlist", thumbnail: initialThumbnail = "", creator: initialCreator = SITE_BRAND, query = "", href }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const [metadata, setMetadata] = useState(null);
  const title = metadata?.title || initialTitle;
  const thumbnail = metadata?.thumbnail || initialThumbnail;
  const creator = metadata?.channel || initialCreator;
  const [retryKey, setRetryKey] = useState(0);
  const [nextPageToken, setNextPageToken] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(null);
  const [search, setSearch] = useState("");
  const requestController = useRef(null);
  const pageBusy = useRef(false);
  const endpoint = query
    ? `/api/youtube-search?type=video&q=${encodeURIComponent(query)}`
    : `/api/youtube-playlist?id=${encodeURIComponent(id)}`;
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setTracks([]);
    setNextPageToken("");
    setError(null);
    requestJson(endpoint, {
      signal: controller.signal,
      fallbackTitle: "Playlist unavailable",
      fallbackMessage: "We couldn’t load the songs in this playlist.",
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setTracks(mergePlaylistTracks([], query ? data?.results : data?.tracks));
        setMetadata(data?.playlist || null);
        setNextPageToken(data?.nextPageToken || "");
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(toUserError(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, query, retryKey]);

  const playback = useMemo(() => collectionPlayback({ id, title, query }, tracks), [id, title, query, tracks]);
  const seededTracks = playback?.queue || [];
  const visibleTracks = seededTracks.filter((track) => `${track.title} ${track.channel}`.toLowerCase().includes(search.trim().toLowerCase()));
  const playTrack = (track) => {
    if (playback) dispatch(startYoutubePlayback({ ...playback, track }));
  };
  const playAll = () => {
    if (playback) dispatch(startYoutubePlayback(playback));
  };
  const loadMore = async () => {
    if (!nextPageToken || pageBusy.current) return;
    const controller = requestController.current;
    pageBusy.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const data = await requestJson(`${endpoint}&pageToken=${encodeURIComponent(nextPageToken)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setTracks((current) => mergePlaylistTracks(current, query ? data?.results : data?.tracks));
      setNextPageToken(data?.nextPageToken === nextPageToken ? "" : data?.nextPageToken || "");
    } catch (failure) {
      if (!controller.signal.aborted) setMoreError(toUserError(failure));
    } finally {
      pageBusy.current = false;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  };

  return (
    <main className="text-white">
      <section className="bg-[linear-gradient(180deg,rgba(0,230,230,0.22),rgba(7,18,29,0.94))] px-[3vw] pb-8 pt-6">
        <div className="mx-auto w-full max-w-[1440px]">
          <button type="button" onClick={() => router.back()} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-gray-300 hover:text-white">
            <FiArrowLeft /> Back
          </button>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <MediaImage src={thumbnail || tracks[0]?.thumbnail} size="hq" alt="" className="aspect-square w-44 shrink-0 rounded-md object-cover shadow-2xl sm:w-56" />
            <div className="min-w-0 pb-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white/70">Playlist</p>
              <h1 className="mt-3 break-words text-4xl font-black sm:text-5xl lg:text-6xl">{cleanTitle(title)}</h1>
              <p className="mt-4 text-sm text-gray-300">{cleanArtist(creator)} · {tracks.length} {tracks.length === 1 ? "song" : "songs"}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-[min(94%,1440px)] pb-12">
        <section className="flex items-center gap-2 py-6" aria-label="Playlist actions">
          <button type="button" onClick={playAll} disabled={!tracks.length} aria-label={`Play ${title}`} className="play-fab play-fab--static h-14 w-14 min-h-14 min-w-14 disabled:opacity-40">
            <FiPlay className="ml-1 fill-current" />
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${SITE_URL}${href}`);
                toast.success("Playlist link copied");
              } catch {
                toast.error("Couldn't copy that");
              }
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white"
          >
            <FiLink /> Copy link
          </button>
        </section>

        {!loading && !error && tracks.length > 0 && <label className="mb-4 block text-sm text-gray-300">
          Search in playlist
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-2 block min-h-11 w-full rounded-md border border-white/20 bg-black/20 px-3 text-white sm:max-w-md" />
        </label>}
        {loading && <SongRowsSkeleton />}
        {!loading && error && <UserMessage title={error.title} message={error.message} onRetry={() => setRetryKey((value) => value + 1)} />}
        {!loading && !error && tracks.length === 0 && <EmptyState title="This playlist is empty" message="No playable songs were found." />}

        {!loading && !error && tracks.length > 0 && (
          <section aria-label={`${title} songs`}>
            <div className="grid grid-cols-[44px_minmax(0,1fr)_52px_52px] items-center gap-2 border-b border-white/10 px-2 pb-2 text-xs uppercase text-gray-400">
              <span className="text-center">#</span><span>Title & artist</span><span className="text-center"><FiClock className="inline" /></span><span />
            </div>
            {visibleTracks.map((track) => (
              <div key={track.id} className="group grid min-h-[66px] grid-cols-[44px_minmax(0,1fr)_52px_52px] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.075]">
                <button type="button" aria-label={`Play ${cleanTitle(track.title)}`} onClick={() => playTrack(track)} className="grid h-11 w-11 place-items-center rounded-full text-sm text-gray-400 hover:text-white">
                  <span className="group-hover:hidden">{seededTracks.indexOf(track) + 1}</span><FiPlay className="hidden fill-current group-hover:block" />
                </button>
                <button type="button" onClick={() => playTrack(track)} className="flex min-w-0 items-center gap-3 text-left">
                  <MediaImage src={track.thumbnail} size="mq" alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{cleanTitle(track.title)}</span><span className="mt-1 block truncate text-xs text-gray-400">{cleanArtist(track.channel)}</span></span>
                </button>
                <span className="text-right text-xs tabular-nums text-gray-400">{formatDuration(track.duration)}</span>
                <AddToQueueButton track={track} className="text-gray-400 hover:text-white" />
              </div>
            ))}
          </section>
        )}
        {!loading && !error && tracks.length > 0 && !visibleTracks.length && <p className="py-6 text-gray-400">No songs match your search.</p>}
        {moreError && <UserMessage title={moreError.title} message={moreError.message} onRetry={loadMore} busy={loadingMore} />}
        {!loading && !error && nextPageToken && <button type="button" disabled={loadingMore} onClick={loadMore} className="btn-ghost mt-6 min-h-11 px-5">{loadingMore ? "Loading…" : "Load more songs"}</button>}
      </div>
    </main>
  );
}

