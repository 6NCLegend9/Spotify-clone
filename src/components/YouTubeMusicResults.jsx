"use client";

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";
import FavouriteTrackButton from "./FavouriteTrackButton";
import AddToPlaylistButton from "./AddToPlaylistButton";
import AddToQueueButton from "./AddToQueueButton";
import toast from "react-hot-toast";

export default function YouTubeMusicResults({ query }) {
  const [results, setResults] = useState([]);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const dispatch = useDispatch();
  const { status } = useSession();
  const [loading, setLoading] = useState(false);
  const [songError, setSongError] = useState("");
  const [loadingPlaylistId, setLoadingPlaylistId] = useState(null);
  const [extrasLoaded, setExtrasLoaded] = useState(false);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [followedArtists, setFollowedArtists] = useState([]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/followedArtists")
      .then((res) => res.json())
      .then((json) => {
        if (json?.success) setFollowedArtists(json.data || []);
      })
      .catch(() => {});
  }, [status]);

  const toggleFollow = async (name) => {
    if (status !== "authenticated") return;
    const isFollowing = followedArtists.some((value) => value.toLowerCase() === name.toLowerCase());
    setFollowedArtists((current) =>
      isFollowing ? current.filter((value) => value.toLowerCase() !== name.toLowerCase()) : [...current, name],
    );
    const response = await fetch("/api/followedArtists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json().catch(() => null);
    if (data?.success) toast.success(data.message);
  };

  useEffect(() => {
    let cancelled = false;
    const search = async () => {
      setLoading(true);
      setSongError("");
      setArtists([]);
      setAlbums([]);
      setExtrasLoaded(false);
      // Only the song/video search runs automatically; artists and playlists cost extra quota
      // and are fetched on demand via "Show artists & playlists" instead.
      const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}&type=video`);
      const data = response.ok ? await response.json() : null;
      if (cancelled) return;
      setResults(response.ok ? data.results || [] : []);
      setSongError(response.ok ? "" : data?.error || "Song search is temporarily unavailable.");
      setLoading(false);
      if (status === "authenticated") {
        fetch("/api/searches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ term: query }),
        }).catch(() => {});
      }
    };

    if (query?.trim()) search();
    return () => {
      cancelled = true;
    };
  }, [query, status]);

  const loadExtras = async () => {
    if (extrasLoaded || loadingExtras) return;
    setLoadingExtras(true);
    const searchUrl = `/api/youtube-search?q=${encodeURIComponent(query)}`;
    const [channelRes, playlistRes] = await Promise.allSettled([
      fetch(`${searchUrl}&type=channel`).then((response) => response.json().then((data) => ({ ok: response.ok, data }))),
      fetch(`${searchUrl}&type=playlist`).then((response) => response.json().then((data) => ({ ok: response.ok, data }))),
    ]);
    const channel = channelRes.status === "fulfilled" ? channelRes.value : null;
    const playlist = playlistRes.status === "fulfilled" ? playlistRes.value : null;
    setArtists(channel?.ok ? channel.data.results || [] : []);
    setAlbums(playlist?.ok ? playlist.data.results || [] : []);
    setExtrasLoaded(true);
    setLoadingExtras(false);
  };

  const playPlaylist = async (playlist) => {
    if (loadingPlaylistId) return;
    setLoadingPlaylistId(playlist.id);
    try {
      const response = await fetch(`/api/youtube-playlist?id=${playlist.id}`);
      const data = response.ok ? await response.json() : null;
      const tracks = data?.tracks || [];
      if (tracks.length === 0) {
        toast.error("This playlist has no playable videos.");
        return;
      }
      dispatch(setYoutubeQueue(tracks));
      dispatch(setYoutubeVideo(tracks[0]));
    } catch (playlistError) {
      toast.error("Could not load this playlist.");
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  return (
    <section className="mt-8" aria-labelledby="youtube-results-title">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00e6e6]">
            YouTube Music
          </p>
          <h2 id="youtube-results-title" className="mt-2 text-2xl font-bold text-white lg:text-3xl">
            Play from YouTube
          </h2>
        </div>
        <span className="hidden text-xs text-gray-400 sm:block">Official videos and audio</span>
      </div>

      {loading && <p className="text-gray-400">Searching YouTube...</p>}
      {!loading && songError && <p className="text-sm text-amber-300">{songError}</p>}
      {!loading && !songError && results.length === 0 && (
        <p className="text-gray-400">No YouTube music found.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((video) => {
          const playVideo = () => {
            dispatch(setYoutubeQueue(results));
            dispatch(setYoutubeVideo(video));
          };
          return (
          <article key={video.id} className="card group text-left">
            <div className="relative aspect-video overflow-hidden bg-black">
              <button type="button" aria-label={`Play ${video.title}`} onClick={playVideo} className="h-full w-full">
                <img src={video.thumbnail} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <span className="absolute bottom-3 left-3 rounded-full bg-[#00e6e6] px-3 py-1 text-xs font-bold text-black">Play</span>
              </button>
              <div className="absolute right-2 top-2 flex gap-1">
                <AddToQueueButton track={video} className="bg-black/70 text-white backdrop-blur" />
                <AddToPlaylistButton track={video} className="bg-black/70 text-white backdrop-blur" />
                <FavouriteTrackButton track={video} className="bg-black/70 text-white backdrop-blur" />
              </div>
            </div>
            <button type="button" onClick={playVideo} className="block w-full p-4 text-left">
              <p className="line-clamp-2 text-sm font-semibold text-white">{video.title}</p>
              <p className="mt-2 truncate text-xs text-gray-400">{video.channel}</p>
            </button>
          </article>
          );
        })}
      </div>

      {!loading && results.length > 0 && !extrasLoaded && (
        <button
          type="button"
          onClick={loadExtras}
          disabled={loadingExtras}
          className="mt-8 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:border-[#00e6e6] hover:text-[#00e6e6] disabled:opacity-60"
        >
          {loadingExtras ? "Loading artists & playlists..." : "Show artists & playlists"}
        </button>
      )}

      {artists.length > 0 && (
        <div className="mt-10">
          <h3 className="mb-4 text-xl font-semibold text-white">Artists</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {artists.map((artist) => {
              const isFollowing = followedArtists.some((value) => value.toLowerCase() === artist.title.toLowerCase());
              return (
              <div key={artist.id} className="group text-center">
                <a
                  href={`https://www.youtube.com/channel/${artist.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src={artist.thumbnail} alt="" className="mx-auto aspect-square w-full rounded-full object-cover transition group-hover:scale-105" />
                  <p className="mt-2 truncate text-sm font-semibold text-white">{artist.title}</p>
                </a>
                {status === "authenticated" && (
                  <button
                    type="button"
                    onClick={() => toggleFollow(artist.title)}
                    className={`mt-1 rounded-full border px-2 py-0.5 text-[11px] transition ${isFollowing ? "border-[#00e6e6] text-[#00e6e6]" : "border-white/15 text-gray-400 hover:border-white/30"}`}
                  >
                    {isFollowing ? "Following" : "Follow"}
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
                <img src={album.thumbnail} alt="" className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105" />
                <p className="truncate p-4 text-sm font-semibold text-white">{loadingPlaylistId === album.id ? "Loading..." : album.title}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
