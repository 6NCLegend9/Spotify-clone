"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";
import toast from "react-hot-toast";
import MediaImage from "@/components/MediaImage";
import { CardGridSkeleton } from "@/components/Skeleton";
import { searchGenres, searchQueryForGenre } from "@/utils/genres";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";

export default function YouTubeMusicResults({ query }) {
  const [results, setResults] = useState([]);
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

  const genreHits = useMemo(() => searchGenres(query, { limit: 8 }), [query]);

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
          `/api/youtube-search?q=${encodeURIComponent(query)}&type=video`,
          {
            signal: controller.signal,
            fallbackTitle: "Search is temporarily unavailable",
            fallbackMessage: "We couldn’t search HayKasa Music. Please try again.",
          },
        );
        if (cancelled) return;
        setResults(Array.isArray(data?.results) ? data.results : []);
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
              message: "We couldn’t search HayKasa Music. Please try again.",
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
    };
  }, [query, searchRetryKey, status]);

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
      dispatch(setYoutubeQueue(seeded));
      dispatch(setYoutubeVideo(seeded[0]));
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
            HayKasa Music
          </p>
          <h2 id="youtube-results-title" className="mt-2 text-2xl font-bold text-white lg:text-3xl">
            Play On HayKasa
          </h2>
        </div>
        <span className="hidden text-xs text-gray-400 sm:block">Official videos and audio</span>
      </div>

      {genreHits.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">Matching genres</p>
          <div className="flex flex-wrap gap-2">
            {genreHits.map((match) => (
              <Link
                key={`${match.id}-${match.matchLabel}`}
                href={`/search/${encodeURIComponent(searchQueryForGenre(match))}`}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-gray-300 transition duration-200 ease-out hover:border-[#00e6e6] hover:text-[#00e6e6]"
              >
                {match.matchLabel}
              </Link>
            ))}
          </div>
        </div>
      )}

      {loading && <CardGridSkeleton count={6} aspect="aspect-video" />}
      {!loading && songError && (
        <UserMessage
          title={songError.title}
          message={songError.message}
          onRetry={() => setSearchRetryKey((value) => value + 1)}
          busy={loading}
        />
      )}
      {!loading && !songError && results.length === 0 && (
        <EmptyState
          eyebrow="Search"
          title="No music found"
          message={`We couldn’t find playable HayKasa Music results for “${query}”. Try another search.`}
          href="/"
          actionLabel="Start another search"
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((video) => {
          const playVideo = () => {
            dispatch(setYoutubeQueue(results));
            dispatch(setYoutubeVideo(video));
          };
          return (
          <article key={video.id} className="card group text-left">
            <button type="button" aria-label={`Play ${video.title}`} onClick={playVideo} className="relative aspect-video w-full overflow-hidden bg-black">
              <MediaImage src={video.thumbnail} size="hq" alt="" className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]" />
            </button>
            <div className="p-4">
              <button type="button" onClick={playVideo} className="block w-full text-left">
                <p className="line-clamp-2 text-sm font-semibold text-white">{video.title}</p>
              </button>
              {video.channelId ? (
                <Link
                  href={`/artist/${encodeURIComponent(video.channelId)}?name=${encodeURIComponent(video.channel || "")}`}
                  className="mt-2 block truncate text-xs text-gray-400 hover:text-[#00e6e6]"
                >
                  {video.channel}
                </Link>
              ) : (
                <p className="mt-2 truncate text-xs text-gray-400">{video.channel}</p>
              )}
            </div>
          </article>
          );
        })}
      </div>

      {!loading && results.length > 0 && !extrasLoaded && (
        <button
          type="button"
          onClick={() => void loadExtras()}
          disabled={loadingExtras}
          className="mt-8 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:border-[#00e6e6] hover:text-[#00e6e6] disabled:opacity-60"
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
              <div key={artist.id} className="group text-center">
                <Link href={`/artist/${encodeURIComponent(artist.id)}?name=${encodeURIComponent(artist.title || "")}`}>
                  <MediaImage src={artist.thumbnail} size="mq" alt="" className="mx-auto aspect-square w-full rounded-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]" />
                  <p className="mt-2 truncate text-sm font-semibold text-white">{artist.title}</p>
                </Link>
                {status === "authenticated" && (
                  <button
                    type="button"
                    onClick={() => void toggleFollow(artist.title, artist.id, artist.thumbnail)}
                    disabled={isUpdating}
                    aria-pressed={isFollowing}
                    className={`mt-1 rounded-full border px-2 py-0.5 text-[11px] transition ${isFollowing ? "border-[#00e6e6] text-[#00e6e6]" : "border-white/15 text-gray-400 hover:border-white/30"}`}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {albums.map((album) => (
              <button
                key={album.id}
                type="button"
                onClick={() => playPlaylist(album)}
                disabled={loadingPlaylistId === album.id}
                className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] text-left disabled:opacity-60"
              >
                <MediaImage src={album.thumbnail} size="hq" alt="" className="aspect-video w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]" />
                <p className="truncate p-4 text-sm font-semibold text-white">{loadingPlaylistId === album.id ? "Loading..." : album.title}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
