"use client";

import ContextMenuTarget from "@/components/ContextMenuTarget";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { playPause, startYoutubePlayback } from "@/redux/features/playerSlice";
import toast from "react-hot-toast";
import { BsPlayFill } from "react-icons/bs";
import MediaImage from "@/components/MediaImage";
import AddToQueueButton from "@/components/AddToQueueButton";
import FavouriteTrackButton from "@/components/FavouriteTrackButton";
import { preferredArtistChannel, artistPageHref } from "@/utils/artistNavigation.mjs";
import ArtistNameLink from "@/components/ArtistNameLink";
import { CardGridSkeleton } from "@/components/Skeleton";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanArtist, cleanTitle } from "@/utils/text";
import { SITE_BRAND } from "@/utils/siteConfig";
import { FOLLOWS_CHANGED_EVENT } from "@/utils/accountNotifications.mjs";
import { isArtistFollowed, updateArtistMembership } from "@/utils/followedArtistsList.mjs";
import { accountOwner } from "@/utils/accountCache.mjs";
import { buildYoutubeSearchUrl } from "@/utils/youtubeSearchUrl.mjs";
import { isTrackAllowed } from "@/utils/explicitContent.mjs";
import { formatDuration } from "@/utils/trackDuration.mjs";
import styles from "./Search/search.module.css";
import { uniqueSearchResults } from "@/utils/searchResults.mjs";

export default function YouTubeMusicResults({ query }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = ["video", "channel", "playlist"].includes(searchParams.get("type")) ? searchParams.get("type") : "all";
  const isAll = view === "all";
  const resultType = isAll ? "video" : view;
  const order = searchParams.get("order") === "date" ? "date" : "relevance";
  const length = resultType === "video" && ["short", "medium", "long"].includes(searchParams.get("duration")) ? searchParams.get("duration") : "any";
  const searchUrl = buildYoutubeSearchUrl({ q: query, type: resultType, order, duration: length }, "interactive");
  const changeSearch = (key, value) => {
    const parameters = new URLSearchParams(searchParams.toString());
    if (key === "type" && value === "all") parameters.delete(key);
    else parameters.set(key, value);
    if (key === "type") parameters.delete("duration");
    router.push(`${pathname}?${parameters}`, { scroll: false });
  };
  const [results, setResults] = useState([]);
  const privateSession = useSelector(state => state.settings.privateSession === true);
  const allowExplicit = useSelector((state) => state.settings.explicitContent === true);
  const visibleResults = results.filter((track) => isTrackAllowed(track, allowExplicit));
  const [nextPageToken, setNextPageToken] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(null);
  const pageController = useRef(null);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const dispatch = useDispatch();
  const playResult = (video) => {
    const title = cleanTitle(video.title);
    const channel = cleanArtist(video.channel);
    const seedQuery = video.seedQuery || video.genre || [channel, title].filter(Boolean).join(" ");
    const track = { ...video, channel: channel || video.channel, seedQuery, genre: video.genre || channel || seedQuery };
    dispatch(startYoutubePlayback({ queue: [track], track }));
    dispatch(playPause(true));
  };
  const { data: session, status } = useSession();
  const followOwner = accountOwner(session, status);
  const followOwnerRef = useRef(followOwner);
  followOwnerRef.current = followOwner;
  const [loading, setLoading] = useState(true);
  const [songError, setSongError] = useState(null);
  const [searchSource, setSearchSource] = useState("");
  const [searchRetryKey, setSearchRetryKey] = useState(0);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState(null);
  const [extrasLoaded, setExtrasLoaded] = useState(false);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [extrasError, setExtrasError] = useState(null);
  const [followedArtists, setFollowedArtists] = useState({ followedArtists: [], followedArtistsMeta: [] });
  const [followError, setFollowError] = useState(null);
  const [loadingFollows, setLoadingFollows] = useState(false);
  const [followRetryKey, setFollowRetryKey] = useState(0);
  const [updatingArtists, setUpdatingArtists] = useState([]);
  const extrasRequestId = useRef(0);
  const extrasController = useRef(null);

  useEffect(() => {
    setUpdatingArtists([]);
    setFollowedArtists({ followedArtists: [], followedArtistsMeta: [] });
  }, [followOwner]);

  useEffect(() => {
    if (status !== "authenticated") {
      setFollowError(null);
      setFollowedArtists({ followedArtists: [], followedArtistsMeta: [] });
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
        if (!cancelled) setFollowedArtists({ followedArtists: json.data, followedArtistsMeta: json.artists });
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
  }, [followOwner, followRetryKey, status]);

  const toggleFollow = async (name, channelId = "", thumbnail = "") => {
    if (status !== "authenticated" || loadingFollows || followError || updatingArtists.length) return;
    const artist = { name, channelId, thumbnail };
    const isFollowing = isArtistFollowed(followedArtists, artist);
    const key = channelId || name.toLowerCase();
    const owner = followOwner;
    const previous = followedArtists;
    try {
      setFollowedArtists(updateArtistMembership(previous, artist, !isFollowing));
      setUpdatingArtists([key]);
      const data = await requestJson("/api/followedArtists", {
        method: "POST", body: { name, channelId, thumbnail, followed: !isFollowing },
        fallbackTitle: "Follow couldn’t be updated",
        fallbackMessage: "Your follow change wasn’t saved. Please try again.",
      });
      if (followOwnerRef.current !== owner) return;
      if (data?.success !== true || !Array.isArray(data.data)) throw new Error("Follow update did not return usable data.");
      setFollowedArtists({ followedArtists: data.data, followedArtistsMeta: data.artists });
      window.dispatchEvent(new Event(FOLLOWS_CHANGED_EVENT));
      toast.success(isFollowing ? "Unfollowed" : "Followed");
    } catch (error) {
      if (followOwnerRef.current !== owner) return;
      setFollowedArtists(previous);
      toast.error(toUserError(error, { title: "Follow couldn’t be updated", message: "Your follow change wasn’t saved. Please try again." }).message);
    } finally {
      if (followOwnerRef.current === owner) setUpdatingArtists([]);
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
      setSearchSource("");
      setArtists([]);
      setAlbums([]);
      setExtrasLoaded(false);
      setExtrasError(null);
      setLoadingExtras(false);
      extrasRequestId.current += 1;
      // All results combine independently loaded song, artist and playlist searches.
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
        const list = uniqueSearchResults(data?.results);
        setSearchSource(data?.source || "");
        if (resultType === "video") setResults(list);
        else if (resultType === "channel") {
          setArtists(list);
        }
        else setAlbums(list);
        setNextPageToken(data?.nextPageToken || "");
        if (status === "authenticated" && !privateSession) {
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
      extrasRequestId.current += 1;
      extrasController.current?.abort();
    };
  }, [query, searchRetryKey, status, searchUrl, resultType, router, privateSession]);

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return;
    const controller = new AbortController();
    pageController.current = controller;
    setLoadingMore(true); setPageError(null);
    try {
      const response = await requestJson(`${searchUrl}&pageToken=${encodeURIComponent(nextPageToken)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const append = (current) => uniqueSearchResults([...current, ...uniqueSearchResults(response.results)]);
      if (resultType === "video") setResults(append);
      else if (resultType === "channel") setArtists(append);
      else setAlbums(append);
      setNextPageToken(response.nextPageToken || "");
    } catch (error) { if (!controller.signal.aborted) setPageError(toUserError(error)); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  };

  const loadExtras = useCallback(async ({ retry = false } = {}) => {
    if ((!retry && extrasLoaded) || loadingExtras) return;
    const requestId = extrasRequestId.current + 1;
    extrasRequestId.current = requestId;
    const controller = new AbortController();
    extrasController.current?.abort();
    extrasController.current = controller;
    setLoadingExtras(true);
    setExtrasError(null);
    try {
      const [channelResult, playlistResult] = await Promise.allSettled([
        requestJson(buildYoutubeSearchUrl({ q: query, type: "channel" }, "interactive"), {
          signal: controller.signal,
          fallbackTitle: "Artists couldn’t be loaded",
          fallbackMessage: "Artist results are temporarily unavailable.",
        }),
        requestJson(buildYoutubeSearchUrl({ q: query, type: "playlist" }, "interactive"), {
          signal: controller.signal,
          fallbackTitle: "Playlists couldn’t be loaded",
          fallbackMessage: "Playlist results are temporarily unavailable.",
        }),
      ]);
      if (requestId !== extrasRequestId.current) return;

      if (channelResult.status === "fulfilled") {
        setArtists(
          uniqueSearchResults(channelResult.value?.results),
        );
      } else {
        setArtists([]);
      }
      if (playlistResult.status === "fulfilled") {
        setAlbums(
          uniqueSearchResults(playlistResult.value?.results),
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
  }, [extrasLoaded, loadingExtras, query]);

  useEffect(() => {
    if (isAll && !loading && !extrasLoaded) void loadExtras();
  }, [isAll, loading, extrasLoaded, loadExtras]);

  const topArtist = isAll ? preferredArtistChannel(artists, query) : null;
  const songsToShow = isAll ? visibleResults.slice(0, 4) : visibleResults;

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
    <section className={styles.results} aria-label={`Search results for ${query}`} aria-busy={loading}>
      <div className={styles.filters}>
        <div role="group" aria-label="Search result type" className={styles.chips}>
          {[["all", "All"], ["video", "Songs"], ["channel", "Artists"], ["playlist", "Playlists"]].map(([value, label]) =>
            <button type="button" key={value} aria-pressed={view === value} onClick={() => changeSearch("type", value)}>{label}</button>)}
        </div>
        <details className={styles.refine}>
          <summary>Refine search</summary>
          <div>
            <label>Sort<select aria-label="Sort search results" value={order} onChange={(event) => changeSearch("order", event.target.value)}>
              <option value="relevance">Relevance</option><option value="date">Newest</option>
            </select></label>
            {resultType === "video" && <label>Duration<select aria-label="Filter song duration" value={length} onChange={(event) => changeSearch("duration", event.target.value)}>
              <option value="any">Any length</option><option value="short">Under 4 min</option><option value="medium">4 to 20 min</option><option value="long">Over 20 min</option>
            </select></label>}
          </div>
        </details>
      </div>

      {loading && <CardGridSkeleton count={6} aspect="aspect-video" />}
      {!loading && !songError && resultType === "video" && searchSource === "fallback" && visibleResults.length > 0 && (
        <p className="mb-4 text-sm text-gray-400" role="status">
          Some songs may be blocked by YouTube. If one cannot play, choose another version or open it on YouTube.
        </p>
      )}
      {!loading && songError && (
        <UserMessage
          title={songError.title}
          message={songError.message}
          onRetry={() => setSearchRetryKey((value) => value + 1)}
          busy={loading}
        />
      )}
      {!loading && !songError && (isAll ? extrasLoaded && !loadingExtras && !visibleResults.length && !artists.length && !albums.length : (resultType === "video" ? visibleResults : resultType === "channel" ? artists : albums).length === 0) && (
        <EmptyState
          eyebrow="Search"
          title="No music found"
          message={`No ${isAll ? "results" : view === "channel" ? "artists" : view === "playlist" ? "playlists" : "songs"} found for “${query}”. Try a different spelling or search.`}
          href="/search"
          actionLabel="Browse music"
        />
      )}

      {!loading && resultType === "video" && visibleResults.length > 0 && <div className={isAll ? styles.overview : styles.songResults}>
        {isAll && <section aria-label="Top result">
          <h2 className="mb-4 text-2xl font-bold">Top result</h2>
          {topArtist ? <article className={styles.topCard}>
            <Link href={artistPageHref(topArtist.id, topArtist.title)} className={styles.topArtist}>
              <MediaImage src={topArtist.thumbnail} alt="" className={styles.topPortrait} />
              <strong>{cleanTitle(topArtist.title)}</strong><span>Artist</span>
            </Link>
          </article> :           <ContextMenuTarget className={`${styles.topCard} group relative`}>
            <MediaImage src={visibleResults[0].thumbnail} size="hq" alt="" className="mb-5 h-24 w-24 rounded-md object-cover shadow-xl" />
            <button type="button" onClick={() => playResult(visibleResults[0])} className="block w-full text-left text-2xl font-bold leading-tight hover:underline">{cleanTitle(visibleResults[0].title)}</button>
            <div className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)]"><span className="rounded-full bg-black/25 px-3 py-1 text-white">Song</span><ArtistNameLink track={visibleResults[0]} /></div>
            <button type="button" aria-label={"Play " + cleanTitle(visibleResults[0].title)} onClick={() => playResult(visibleResults[0])} className="play-fab play-fab--static absolute bottom-4 right-4 h-12 w-12"><BsPlayFill size={26} /></button>
          </ContextMenuTarget>}
        </section>}
        <section aria-label="Songs">
          <header className={styles.sectionHead}><h2>Songs</h2>{isAll && <button type="button" onClick={() => changeSearch("type", "video")}>Show all</button>}</header>
          <div role="list">
            {songsToShow.map((video, index) => {
              const title = cleanTitle(video.title);
              const duration = formatDuration(video.duration);
              return <ContextMenuTarget key={video.id} role="listitem" data-search-track={video.id} className={`${styles.songRow} group`}>
                <button type="button" onClick={() => playResult(video)} aria-label={"Play " + title} className="relative flex min-h-11 items-center gap-3">
                  <span className={styles.songNumber}>{index + 1}</span>
                  <MediaImage src={video.thumbnail} size="hq" alt="" className="h-10 w-10 rounded object-cover" />
                  <span className={styles.songPlay}><BsPlayFill size={22} /></span>
                </button>
                <div className="min-w-0"><button type="button" onClick={() => playResult(video)} className="block w-full truncate text-left text-sm font-medium hover:underline" title={title}>{title}</button><ArtistNameLink track={video} className="mt-1 block truncate text-xs text-[var(--muted)] hover:text-white" /></div>
                <FavouriteTrackButton track={video} className="!h-11 !w-11" />
                <AddToQueueButton track={video} className="text-[var(--muted)] hover:text-white" />
                <span className={styles.duration} aria-label={`Duration ${duration}`}>{duration}</span>
              </ContextMenuTarget>;
            })}
          </div>
        </section>
      </div>}

      {isAll && loadingExtras && <p role="status" className="mt-6 text-sm text-[var(--muted)]">Loading artists and playlists…</p>}

      {isAll && extrasError && (
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

      {(isAll || view === "channel") && followError && (
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

      {!loading && (isAll || view === "channel") && artists.length > 0 && (
        <div className="mt-10">
          <header className={styles.sectionHead}><h2>Artists</h2>{isAll && <button type="button" onClick={() => changeSearch("type", "channel")}>Show all artists</button>}</header>
          <div className={styles.cardGrid}>
            {(isAll ? artists.slice(0, 6) : artists).map((artist) => {
              const isFollowing = isArtistFollowed(followedArtists, { name: artist.title, channelId: artist.id });
              const isUpdating = updatingArtists.includes(artist.id || artist.title.toLowerCase());
              return (
              <div key={artist.id} className={`${styles.artistCard} group`}>
                <Link href={`/artist/${encodeURIComponent(artist.id)}?name=${encodeURIComponent(artist.title || "")}`} prefetch={false}>
                  <MediaImage src={artist.thumbnail} size="mq" alt="" className="mx-auto aspect-square w-full rounded-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]" />
                  <p className="mt-3 truncate text-sm font-semibold text-white">{cleanTitle(artist.title)}</p><p className="mt-1 text-sm text-[var(--muted)]">Artist</p>
                </Link>
                {status === "authenticated" && (
                  <button
                    type="button"
                    onClick={() => void toggleFollow(artist.title, artist.id, artist.thumbnail)}
                    disabled={loadingFollows || Boolean(followError) || updatingArtists.length > 0}
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

      {!loading && (isAll || view === "playlist") && albums.length > 0 && (
        <div className="mt-10">
          <header className={styles.sectionHead}><h2>Playlists</h2>{isAll && <button type="button" onClick={() => changeSearch("type", "playlist")}>Show all playlists</button>}</header>
          <div className={styles.cardGrid}>
            {(isAll ? albums.slice(0, 6) : albums).map((album) => {
              const playlistHref = `/youtube-playlist/${encodeURIComponent(album.id)}?${new URLSearchParams({
                title: album.title || "Playlist",
                thumbnail: album.thumbnail || "",
                creator: album.channel || SITE_BRAND,
              })}`;
              return (
                <article key={album.id} className={`${styles.playlistCard} group relative`}>
                  <Link href={playlistHref} className="block" aria-label={`View playlist ${cleanTitle(album.title)}`}>
                    <span className="relative block aspect-square overflow-hidden rounded-md">
                      <MediaImage src={album.thumbnail} size="hq" alt="" className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]" />
                    </span>
                    <p className="mt-3 line-clamp-2 text-sm font-semibold">{cleanTitle(album.title)}</p><p className="mt-1 truncate text-sm text-[var(--muted)]">By {cleanArtist(album.channel) || SITE_BRAND}</p>
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
      {!loading && !isAll && nextPageToken && <button type="button" className="btn-ghost mt-6 min-h-12 px-5" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading..." : "Load more results"}</button>}
    </section>
  );
}
