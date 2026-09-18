"use client";

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import toast from "react-hot-toast";
import MediaImage from "@/components/MediaImage";
import PlayFab from "@/components/PlayFab";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { CardGridSkeleton } from "@/components/Skeleton";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";

export default function ArtistProfile({ artistId, initialName = "" }) {
  const dispatch = useDispatch();
  const { status } = useSession();
  const [artist, setArtist] = useState({ id: artistId, title: initialName, description: "", thumbnail: "" });
  const [tracks, setTracks] = useState([]);
  const [nextPageToken, setNextPageToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [followed, setFollowed] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [alsoPlay, setAlsoPlay] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ id: artistId });
        if (initialName) params.set("name", initialName);
        const data = await requestJson(`/api/youtube-channel?${params}`, {
          signal: controller.signal,
          fallbackTitle: "Artist unavailable",
          fallbackMessage: "We couldn’t load this artist. Please try again.",
        });
        if (cancelled) return;
        if (data?.artist) setArtist(data.artist);
        setTracks(Array.isArray(data?.tracks) ? data.tracks : []);
        setNextPageToken(typeof data?.nextPageToken === "string" ? data.nextPageToken : "");
      } catch (loadError) {
        if (!cancelled && !controller.signal.aborted) {
          setTracks([]);
          setError(toUserError(loadError, { title: "Artist unavailable", message: "We couldn’t load this artist. Please try again." }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [artistId, initialName, retryKey]);

  const seedKey = tracks.slice(0, 3).map((track) => track.id).filter(Boolean).join(",");

  useEffect(() => {
    if (!artistId || !seedKey) {
      setAlsoPlay([]);
      return undefined;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ id: artistId });
    if (artist.title || initialName) params.set("name", artist.title || initialName);
    seedKey.split(",").forEach((id) => params.append("video", id));
    requestJson(`/api/channel-rabbit-hole?${params}`, {
      signal: controller.signal,
      fallbackTitle: "Related songs unavailable",
      fallbackMessage: "We couldn’t load songs people also play.",
    }).then((data) => {
      setAlsoPlay(Array.isArray(data?.tracks) ? data.tracks : []);
    }).catch(() => {
      if (!controller.signal.aborted) setAlsoPlay([]);
    });
    return () => controller.abort();
  }, [artist.title, artistId, initialName, seedKey]);

  useEffect(() => {
    if (status !== "authenticated" || !artist.title) return undefined;
    const controller = new AbortController();
    requestJson("/api/followedArtists", {
      signal: controller.signal,
      fallbackTitle: "Follow status unavailable",
      fallbackMessage: "You can still play this artist.",
    }).then((json) => {
      if (json?.success === true && Array.isArray(json.data)) {
        setFollowed(json.data.some((value) => value.toLowerCase() === artist.title.toLowerCase()));
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [artist.title, status]);

  const title = artist.title || initialName || "Artist";
  const playbackContext = { type: "artist", id: String(artist.id || artistId), name: title };
  const alsoPlayVisible = alsoPlay.filter((video) => video?.id && !tracks.some((track) => track.id === video.id));

  const playTrack = (video, list = tracks) => {
    const queue = list.map((item) => ({
      ...item,
      seedQuery: item.seedQuery || artist.title,
      genre: item.genre || artist.title,
    }));
    const selected = queue.find((item) => item.id === video.id) || {
      ...video,
      seedQuery: video.seedQuery || artist.title,
      genre: video.genre || artist.title,
    };
    dispatch(startYoutubePlayback({
      queue,
      track: selected,
      queueMode: "collection",
      autoExtend: false,
      context: playbackContext,
    }));
  };

  const playAll = () => { if (tracks[0]) playTrack(tracks[0]); };

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ id: artistId, pageToken: nextPageToken });
      if (initialName || artist.title) params.set("name", initialName || artist.title);
      const data = await requestJson(`/api/youtube-channel?${params}`, {
        fallbackTitle: "More songs unavailable",
        fallbackMessage: "We couldn’t load more songs. Please try again.",
      });
      const extra = Array.isArray(data?.tracks) ? data.tracks : [];
      setTracks((current) => {
        const seen = new Set(current.map((track) => track.id));
        return [...current, ...extra.filter((track) => track?.id && !seen.has(track.id))];
      });
      setNextPageToken(typeof data?.nextPageToken === "string" ? data.nextPageToken : "");
    } catch (loadError) {
      toast.error(toUserError(loadError, { title: "More songs unavailable", message: "We couldn’t load more songs. Please try again." }).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleFollow = async () => {
    if (status !== "authenticated" || !artist.title || followBusy) return;
    const next = !followed;
    setFollowBusy(true);
    setFollowed(next);
    try {
      const data = await requestJson("/api/followedArtists", {
        method: "POST",
        body: { name: artist.title, channelId: artist.id, thumbnail: artist.thumbnail },
        fallbackTitle: "Follow couldn’t be updated",
        fallbackMessage: "Your follow change wasn’t saved. Please try again.",
      });
      if (data?.success === true && Array.isArray(data.data)) {
        setFollowed(data.data.some((value) => value.toLowerCase() === artist.title.toLowerCase()));
      }
      toast.success(next ? "Followed" : "Unfollowed");
    } catch (followError) {
      setFollowed(!next);
      toast.error(toUserError(followError).message);
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <div className="page text-gray-200">
      <header className="page-hero border-b border-white/10 pb-6">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end">
          <MediaImage src={artist.thumbnail} size="hq" alt="" className="h-36 w-36 shrink-0 rounded-full object-cover ring-1 ring-white/10 sm:h-44 sm:w-44" />
          <div className="min-w-0">
            <p className="eyebrow">Artist</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-5xl">{title}</h1>
            {artist.description ? <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-6 text-[#9aa8b5]">{artist.description}</p> : <p className="mt-3 text-sm text-[#9aa8b5]">Songs and videos from this artist.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={playAll} disabled={tracks.length === 0} className="btn-primary disabled:opacity-50">Play</button>
              {status === "authenticated" ? <button type="button" onClick={() => void toggleFollow()} disabled={followBusy} aria-pressed={followed} className="btn-ghost">{followBusy ? "Saving…" : followed ? "Following" : "Follow"}</button> : null}
            </div>
          </div>
        </div>
      </header>

      {loading ? <div className="mt-8"><CardGridSkeleton count={6} aspect="aspect-video" /></div> : null}
      {!loading && error ? <div className="mt-8"><UserMessage title={error.title} message={error.message} onRetry={() => setRetryKey((value) => value + 1)} busy={loading} /></div> : null}
      {!loading && !error && tracks.length === 0 ? <div className="mt-8"><EmptyState eyebrow="Artist" title={`No songs found for ${title}`} message="Try another search to find playable tracks." href="/" actionLabel="Back to Home" /></div> : null}

      {tracks.length > 0 ? (
        <section className="mt-8" aria-labelledby="artist-songs-title">
          <h2 id="artist-songs-title" className="mb-4 text-xl font-semibold text-white">More from this channel<span className="ml-2 text-sm font-normal text-[#9aa8b5]">{tracks.length}</span></h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map((video) => (
              <article key={video.id} className="card group text-left">
                <button type="button" aria-label={`Play ${cleanTitle(video.title)}`} onClick={() => playTrack(video)} className="relative aspect-video w-full overflow-hidden rounded-[4px] bg-black">
                  <MediaImage src={video.thumbnail} size="hq" alt="" className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]" />
                  <PlayFab />
                </button>
                <button type="button" onClick={() => playTrack(video)} className="block w-full p-3 text-left">
                  <p className="home-shelf-title mt-0">{cleanTitle(video.title, "Untitled track")}</p>
                  <p className="home-shelf-subtitle">{video.channel || title}</p>
                </button>
              </article>
            ))}
          </div>
          {nextPageToken ? <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn-ghost mt-6 text-sm disabled:opacity-60">{loadingMore ? "Loading more…" : "Load more from this channel"}</button> : null}
        </section>
      ) : null}

      {alsoPlayVisible.length > 0 ? (
        <section className="mt-10" aria-labelledby="artist-comments-title">
          <h2 id="artist-comments-title" className="mb-4 text-xl font-semibold text-white">From the comments people also play</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alsoPlayVisible.map((video) => (
              <article key={video.id} className="card group text-left">
                <button type="button" aria-label={`Play ${cleanTitle(video.title)}`} onClick={() => playTrack(video, alsoPlayVisible)} className="relative aspect-video w-full overflow-hidden rounded-[4px] bg-black">
                  <MediaImage src={video.thumbnail} size="hq" alt="" className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]" />
                  <PlayFab />
                </button>
                <button type="button" onClick={() => playTrack(video, alsoPlayVisible)} className="block w-full p-3 text-left">
                  <p className="home-shelf-title mt-0">{cleanTitle(video.title, "Untitled track")}</p>
                  <p className="home-shelf-subtitle">{video.channel || title}</p>
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
