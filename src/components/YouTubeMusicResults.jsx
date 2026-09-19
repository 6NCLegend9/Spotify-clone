"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { playPause, startYoutubePlayback } from "@/redux/features/playerSlice";
import toast from "react-hot-toast";
import { BsPlayFill } from "react-icons/bs";
import MediaImage from "@/components/MediaImage";
import PlayFab from "@/components/PlayFab";
import AddToQueueButton from "@/components/AddToQueueButton";
import { CardGridSkeleton } from "@/components/Skeleton";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanArtist, cleanTitle } from "@/utils/text";
import { SITE_BRAND, SITE_NAME } from "@/utils/siteConfig";
import { FOLLOWS_CHANGED_EVENT } from "@/utils/accountNotifications.mjs";

export default function YouTubeMusicResults({ query }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const resultType = ["video", "channel", "playlist"].includes(searchParams.get("type")) ? searchParams.get("type") : "video";
  const order = searchParams.get("order") === "date" ? "date" : "relevance";
  const length = resultType === "video" && ["short", "medium", "long"].includes(searchParams.get("duration")) ? searchParams.get("duration") : "any";
  const searchUrl = `/api/youtube-search?${new URLSearchParams({ q: query, type: resultType, order, duration: length })}`;
  const changeSearch = (key, value) => {
    const parameters = new URLSearchParams(searchParams.toString());
    parameters.set(key, value);
    if (key === "type") parameters.delete("duration");
    router.push(`${pathname}?${parameters}`, { scroll: false });
  };
  const [results, setResults] = useState([]);
  const [nextPageToken, setNextPageToken] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(null);
  const pageController = useRef(null);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const dispatch = useDispatch();
  const { status } = useSession();
  const [loading, setLoading] = useState(false);
  const [songError, setSongError] = useState(null);
  const [searchRetryKey, setSearchRetryKey] = useState(0);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState(null);
  const [extrasLoaded, setExtrasLoaded] = useState(false);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [extrasError, setExtrasError] = useState(null);
  const [followedArtists, setFollowedArtists] = useState([]);
  const [followError, setFollowError] = useState(null);
  const [loadingFollows, setLoadingFollows] = useState(false);
  const [followRetryKey, setFollowRetryKey] = useState(0);
  const [updatingArtists, setUpdatingArtists] = useState([]);
  const extrasRequestId = useRef(0);

  useEffect(() => {
    if (status !== "authenticated") {
      setFollowError(null);
      setFollowedArtists([]);
      setLoadingFollows(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const loadFollowedArtists = async () => {
      setLoadingFollows(true);
      setFollowError(null);
      try {
        const json = await requestJson("/api/followedArtists", {
          signal: controller.signal,
          fallbackTitle: "Follow status unavailable",
          fallbackMessage: "You can still browse artists and try syncing follows again.",
        });
        if (json?.success !== true || !Array.isArray(json.data)) {
          throw new Error("Follow status did not return usable data.");
        }
        if (!cancelled) setFollowedArtists(json.data);
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setFollowError(
            toUserError(error, {
              title: "Follow status unavailable",
              message: "You can still browse artists and try syncing follows again.",
            }),
          );
        }
      } finally {
        if (!cancelled) setLoadingFollows(false);
      }
    };
    void loadFollowedArtists();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [followRetryKey, status]);

  const toggleFollow = async (name, channelId = "", thumbnail = "") => {
    if (status !== "authenticated") return;
    const isFollowing = followedArtists.some((value) => value.toLowerCase() === name.toLowerCase());
    const normalizedName = name.toLowerCase();
    if (updatingArtists.includes(normalizedName)) return;
    setUpdatingArtists((current) => [...current, normalizedName]);
    setFollowedArtists((current) =>
      isFollowing ? current.filter((value) => value.toLowerCase() !== name.toLowerCase()) : [...current, name],
    );
    try {
      const data = await requestJson("/api/followedArtists", {
        method: "POST",
        body: { name, channelId, thumbnail },
        fallbackTitle: "Follow couldn’t be updated",
        fallbackMessage: "Your follow change wasn’t saved. Please try again.",
      });
      if (data?.success !== true || !Array.isArray(data.data)) {
        throw new Error("Follow update did not return usable data.");
      }
      setFollowedArtists(data.data);
      window.dispatchEvent(new Event(FOLLOWS_CHANGED_EVENT));
      const successMessage =
        typeof data?.message === "string" && data.message.trim()
          ? data.message
          : isFollowing
            ? "Unfollowed"
            : "Followed";
      toast.success(successMessage);
    } catch (error) {
      setFollowedArtists((current) => {
        const containsArtist = current.some(
          (value) => value.toLowerCase() === normalizedName,
        );
        if (isFollowing && !containsArtist) return [...current, name];
        if (!isFollowing && containsArtist) {
          return current.filter((value) => value.toLowerCase() !== normalizedName);
        }
        return current;
      });
      const userError = toUserError(error, {
        title: "Follow couldn’t be updated",
        message: "Your follow change wasn’t saved. Please try again.",
      });
      toast.error(userError.message);
    } finally {
      setUpdatingArtists((current) =>
        current.filter((value) => value !== normalizedName),
      );
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const search = async () => {
      setLoading(true);
      setResults([]);
      setNextPageToken("");
      setPageError(null);
      setLoadingMore(false);
      setSongError(null);
      setArtists([]);
      setAlbums([]);
      setExtrasLoaded(false);
      setExtrasError(null);
      setLoadingExtras(false);
      extrasRequestId.current += 1;
      // Only the song/video search runs automatically; artists and playlists cost extra quota
      // and are fetched on demand via "Show artists & playlists" instead.
      try {
        const data = await requestJson(
          searchUrl,
          {
            signal: controller.signal,
            fallbackTitle: "Search is temporarily unavailable",
            fallbackMessage: `We couldn’t search ${SITE_BRAND}. Please try again.`,
          },
        );
        if (cancelled) return;
        const list = Array.isArray(data?.results) ? data.results : [];
        if (resultType === "video") setResults(list);
        else if (resultType === "channel") setArtists(list);
        else setAlbums(list);
        setNextPageToken(data?.nextPageToken || "");
        if (status === "authenticated") {
          void requestJson("/api/searches", {
            method: "POST",
            body: { term: query },
          }).catch(() => {
            // Search history is optional and must not interrupt visible results.
          });
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setResults([]);
          setSongError(
            toUserError(error, {
              title: "Search is temporarily unavailable",
              message: `We couldn’t search ${SITE_BRAND}. Please try again.`,
            }),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (query?.trim()) {
      void search();
    } else {
      setResults([]);
      setSongError(null);
      setLoading(false);
    }
    return () => {
      cancelled = true;
      controller.abort();
      pageController.current?.abort();
    };
  }, [query, searchRetryKey, status, searchUrl, resultType]);

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return;
    const controller = new AbortController();
    pageController.current = controller;
    setLoadingMore(true); setPageError(null);
    try {
      const response = await requestJson(`${searchUrl}&pageToken=${encodeURIComponent(nextPageToken)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const append = (current) => [...current, ...(response.results || [])].filter((item, index, all) => all.findIndex((entry) => entry.id === item.id) === index);
      if (resultType === "video") setResults(append);
      else if (resultType === "channel") setArtists(append);
      else setAlbums(append);
      setNextPageToken(response.nextPageToken || "");
    } catch (error) { if (!controller.signal.aborted) setPageError(toUserError(error)); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  };

  const loadExtras = async ({ retry = false } = {}) => {
    if ((!retry && extrasLoaded) || loadingExtras) return;
    const requestId = extrasRequestId.current + 1;
    extrasRequestId.current = requestId;
    setLoadingExtras(true);
    setExtrasError(null);
    try {
      const searchUrl = `/api/youtube-search?q=${encodeURIComponent(query)}`;
      const [channelResult, playlistResult] = await Promise.allSettled([
        requestJson(`${searchUrl}&type=channel`, {
          fallbackTitle: "Artists couldn’t be loaded",
          fallbackMessage: "Artist results are temporarily unavailable.",
        }),
        requestJson(`${searchUrl}&type=playlist`, {
          fallbackTitle: "Playlists couldn’t be loaded",
          fallbackMessage: "Playlist results are temporarily unavailable.",
        }),
      ]);
      if (requestId !== extrasRequestId.current) return;

      if (channelResult.status === "fulfilled") {
        setArtists(
          Array.isArray(channelResult.value?.results)
            ? channelResult.value.results
            : [],
        );
      } else {
        setArtists([]);
      }
      if (playlistResult.status === "fulfilled") {
        setAlbums(
          Array.isArray(playlistResult.value?.results)
            ? playlistResult.value.results
            : [],
        );
      } else {
        setAlbums([]);
      }

      const failedLabels = [
        channelResult.status === "rejected" ? "artists" : null,
        playlistResult.status === "rejected" ? "playlists" : null,
      ].filter(Boolean);
      if (failedLabels.length > 0) {
        const sourceError =
          channelResult.status === "rejected"
            ? channelResult.reason
            : playlistResult.reason;
        const normalized = toUserError(sourceError);
        setExtrasError({
          title: failedLabels.length === 2
            ? "Artists and playlists couldn’t load"
            : `${failedLabels[0][0].toUpperCase()}${failedLabels[0].slice(1)} couldn’t load`,
          message:
            failedLabels.length === 2
              ? "The main song results are still available. Try loading these extras again."
              : `${failedLabels[0][0].toUpperCase()}${failedLabels[0].slice(1)} are temporarily unavailable. Other results are still available.`,
          retryable: normalized.retryable,
        });
      }
    } catch (error) {
      if (requestId === extrasRequestId.current) {
        const normalized = toUserError(error, {
          title: "Artists and playlists couldn’t load",
          message: "The main song results are still available. Try loading these extras again.",
        });
        setArtists([]);
        setAlbums([]);
        setExtrasError(normalized);
      }
    } finally {
      if (requestId === extrasRequestId.current) {
        setExtrasLoaded(true);
        setLoadingExtras(false);
      }
    }
  };

  const playPlaylist = async (playlist) => {
    if (loadingPlaylistId) return;
    setLoadingPlaylistId(playlist.id);
    try {
      const data = await requestJson(
        `/api/youtube-playlist?id=${encodeURIComponent(playlist.id)}`,
        {
          fallbackCode: "PLAYBACK_ERROR",
          fallbackTitle: "Playlist unavailable",
          fallbackMessage: "We couldn’t load this playlist. Please try again.",
        },
      );
      const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
      if (tracks.length === 0) {
        toast.error("This playlist has no playable videos.");
        return;
      }
      const seeded = tracks.map((track) => ({
        ...track,
        seedQuery: playlist.title || playlist.seedQuery,
        genre: playlist.title,
      }));
      dispatch(startYoutubePlayback({ queue: seeded, track: seeded[0], autoExtend: false }));
      dispatch(playPause(true));
    } catch (error) {
      const userError = toUserError(error, {
        title: "Playlist unavailable",
        message: "We couldn’t load this playlist. Please try again.",
      });
      toast.error(userError.message);
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  return (
    <section className="mt-8" aria-labelledby="youtube-results-title">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00e6e6]">
            {SITE_BRAND}
          </p>
          <h2 id="youtube-results-title" className="mt-2 text-2xl font-bold tracking-tight text-white lg:text-3xl">
            Play on {SITE_NAME}
          </h2>
        </div>
        <span className="hidden text-xs text-gray-400 sm:block">Official videos and audio</span>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--hairline)] pb-4">
        <div role="tablist" aria-label="Search result type" className="flex flex-wrap gap-2">
          {[["video", "Songs"], ["channel", "Artists"], ["playlist", "Playlists"]].map(([value, label]) =>
            <button type="button" role="tab" key={value} aria-selected={resultType === value} onClick={() => changeSearch("type", value)}
              className={`search-type-tab ${resultType === value ? "is-active" : ""}`}>{label}</button>)}
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs text-[var(--muted)]">Sort
            <select aria-label="Sort search results" value={order} onChange={(event) => changeSearch("order", event.target.value)} className="min-h-12 rounded border border-[var(--hairline)] bg-[var(--navy-surface)] px-3 text-sm text-[var(--text)]">
              <option value="relevance">Relevance</option><option value="date">Newest</option>
            </select>
          </label>
          {resultType === "video" && <label className="grid gap-1 text-xs text-[var(--muted)]">Duration
            <select aria-label="Filter song duration" value={length} onChange={(event) => changeSearch("duration", event.target.value)} className="min-h-12 rounded border border-[var(--hairline)] bg-[var(--navy-surface)] px-3 text-sm text-[var(--text)]">
              <option value="any">Any length</option><option value="short">Under 4 min</option><option value="medium">4 to 20 min</option><option value="long">Over 20 min</option>
            </select>
          </label>}
        </div>
      </div>

      {loading && <CardGridSkeleton count={6} aspect="aspect-video" />}
      {!loading && songError && (
        <UserMessage
          title={songError.title}
          message={songError.message}
          onRetry={() => setSearchRetryKey((value) => value + 1)}
          busy={loading}
        />
      )}
      {!loading && !songError && (resultType === "video" ? results : resultType === "channel" ? artists : albums).length === 0 && (
        <EmptyState
          eyebrow="Search"
          title="No music found"
          message={`We couldn’t find playable ${SITE_BRAND} results for “${query}”. Try another search.`}
          href="/"
          actionLabel="Start another search"
        />
      )}

      {resultType === "video" && <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((video) => {
          const title = cleanTitle(video.title);
          const channel = cleanArtist(video.channel);
          const playVideo = () => {
            const seedQuery = video.seedQuery || video.genre || [channel, title].filter(Boolean).join(" ");
            const radioTrack = {
              ...video,
              channel: channel || video.channel,
              seedQuery,
              genre: video.genre || channel || seedQuery,
            };
            dispatch(startYoutubePlayback({ queue: [radioTrack], track: radioTrack }));
            dispatch(playPause(true));
          };
          return (
          <article key={video.id} className="card group text-left">
            <button type="button" aria-label={`Play ${title}`} onClick={playVideo} className="relative aspect-video w-full overflow-hidden rounded-[4px] bg-black">
              <MediaImage src={video.thumbnail} size="hq" alt="" className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]" />
              <PlayFab />
            </button>
            <div className="p-3">
              <button type="button" onClick={playVideo} className="block w-full text-left">
                <p className="home-shelf-title mt-0">{title}</p>
              </button>
              <div className="flex min-w-0 items-center gap-1">
              <div className="min-w-0 flex-1">
              {video.channelId ? (
                <Link
                  href={`/artist/${encodeURIComponent(video.channelId)}?name=${encodeURIComponent(channel || "")}`}
                  prefetch={false}
                  className="mt-2 block truncate text-xs text-gray-400 hover:text-[#00e6e6]"
                >
                  {channel}
                </Link>
              ) : (
                <p className="mt-2 truncate text-xs text-gray-400">{channel}</p>
              )}
              </div>
              <AddToQueueButton track={video} className="text-gray-400 hover:text-white" />
              </div>
            </div>
          </article>
          );
        })}
      </div>}

      {!loading && resultType === "video" && results.length > 0 && !extrasLoaded && (
        <button
          type="button"
          onClick={() => void loadExtras()}
          disabled={loadingExtras}
          className="btn-ghost mt-8 text-xs"
        >
          {loadingExtras ? "Loading artists & playlists..." : "Show artists & playlists"}
        </button>
      )}

      {extrasError && (
        <div className="mt-6">
          <UserMessage
            tone="warning"
            title={extrasError.title}
            message={extrasError.message}
            onRetry={() => void loadExtras({ retry: true })}
            busy={loadingExtras}
            compact
          />
        </div>
      )}

      {extrasLoaded &&
        !loadingExtras &&
        !extrasError &&
        artists.length === 0 &&
        albums.length === 0 && (
          <div className="mt-6">
            <EmptyState
              eyebrow="Artists and playlists"
              title="No extra results found"
              message="The song results above are still ready to play."
            />
          </div>
        )}

      {extrasLoaded && followError && (
        <div className="mt-6">
          <UserMessage
            tone="warning"
            title={followError.title}
            message={followError.message}
            onRetry={() => setFollowRetryKey((value) => value + 1)}
            busy={loadingFollows}
            compact
          />
        </div>
      )}

      {artists.length > 0 && (
        <div className="mt-10">
          <h3 className="mb-4 text-xl font-semibold text-white">Artists</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {artists.map((artist) => {
              const isFollowing = followedArtists.some((value) => value.toLowerCase() === artist.title.toLowerCase());
              const isUpdating = updatingArtists.includes(artist.title.toLowerCase());
              return (
              <div key={artist.id} className="home-shelf-card group text-center">
                <Link href={`/artist/${encodeURIComponent(artist.id)}?name=${encodeURIComponent(artist.title || "")}`} prefetch={false}>
                  <MediaImage src={artist.thumbnail} size="mq" alt="" className="mx-auto aspect-square w-full rounded-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]" />
                  <p className="mt-2 truncate text-sm font-semibold text-white">{cleanTitle(artist.title)}</p>
                </Link>
                {status === "authenticated" && (
                  <button
                    type="button"
                    onClick={() => void toggleFollow(artist.title, artist.id, artist.thumbnail)}
                    disabled={isUpdating}
                    aria-pressed={isFollowing}
                    className={`home-chip mt-1 ${isFollowing ? "is-active" : ""}`}
                  >
                    {isUpdating ? "Saving…" : isFollowing ? "Following" : "Follow"}
                  </button>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {albums.length > 0 && (
        <div className="mt-10">
          <h3 className="mb-4 text-xl font-semibold text-white">Albums & Playlists</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {albums.map((album) => {
              const playlistHref = `/youtube-playlist/${encodeURIComponent(album.id)}?${new URLSearchParams({
                title: album.title || "Playlist",
                thumbnail: album.thumbnail || "",
                creator: album.channel || SITE_BRAND,
              })}`;
              return (
                <article key={album.id} className="card group relative w-full overflow-hidden text-left">
                  <Link href={playlistHref} className="block" aria-label={`View playlist ${cleanTitle(album.title)}`}>
                    <span className="relative block aspect-video overflow-hidden rounded-[4px]">
                      <MediaImage src={album.thumbnail} size="hq" alt="" className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]" />
                    </span>
                    <p className="home-shelf-title px-3 pb-3">{cleanTitle(album.title)}</p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => playPlaylist(album)}
                    disabled={loadingPlaylistId === album.id}
                    aria-label={`Play playlist ${cleanTitle(album.title)}`}
                    className="play-fab absolute bottom-12 right-3 z-10 h-12 w-12 min-h-12 min-w-12 disabled:opacity-60"
                  >
                    {loadingPlaylistId === album.id ? <span className="custom-loader" /> : <BsPlayFill aria-hidden="true" className="text-2xl" />}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}
      {pageError && <div className="mt-4"><UserMessage title={pageError.title} message={pageError.message} onRetry={loadMore} /></div>}
      {!loading && nextPageToken && <button type="button" className="btn-ghost mt-6 min-h-12 px-5" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading..." : "Load more results"}</button>}
    </section>
  );
}
