"use client";

import { useEffect, useState } from "react";

export default function YouTubeMusicResults({ query }) {
  const [results, setResults] = useState([]);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [activeVideo, setActiveVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const search = async () => {
      setLoading(true);
      setError("");
      try {
        const searchUrl = `/api/youtube-search?q=${encodeURIComponent(query)}`;
        const responses = await Promise.all([
          fetch(`${searchUrl}&type=video`),
          fetch(`${searchUrl}&type=channel`),
          fetch(`${searchUrl}&type=playlist`),
        ]);
        const data = await Promise.all(responses.map((response) => response.json()));
        const failedResponse = responses.find((response) => !response.ok);
        if (failedResponse) throw new Error(data[0].error || "YouTube search failed.");
        if (!cancelled) {
          setResults(data[0].results || []);
          setArtists(data[1].results || []);
          setAlbums(data[2].results || []);
          setActiveVideo(null);
        }
      } catch (searchError) {
        if (!cancelled) {
          setResults([]);
          setArtists([]);
          setAlbums([]);
          setError(searchError.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (query?.trim()) search();
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <section className="mt-12 border-t border-white/10 pt-8" aria-labelledby="youtube-results-title">
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
      {!loading && error && <p className="text-sm text-amber-300">{error}</p>}
      {!loading && !error && results.length === 0 && artists.length === 0 && albums.length === 0 && (
        <p className="text-gray-400">No YouTube music found.</p>
      )}

      {activeVideo && (
        <div className="mb-6 overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
          <div className="aspect-video w-full">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${activeVideo.id}?autoplay=1&rel=0`}
              title={activeVideo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((video) => (
          <button
            key={video.id}
            type="button"
            onClick={() => setActiveVideo(video)}
            className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] text-left transition hover:-translate-y-1 hover:border-[#00e6e6]/50 hover:bg-white/[0.08]"
          >
            <div className="relative aspect-video overflow-hidden bg-black">
              <img
                src={video.thumbnail}
                alt=""
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
              <span className="absolute bottom-3 left-3 rounded-full bg-[#00e6e6] px-3 py-1 text-xs font-bold text-black">
                Play
              </span>
            </div>
            <div className="p-4">
              <p className="line-clamp-2 text-sm font-semibold text-white">{video.title}</p>
              <p className="mt-2 truncate text-xs text-gray-400">{video.channel}</p>
            </div>
          </button>
        ))}
      </div>

      {artists.length > 0 && (
        <div className="mt-10">
          <h3 className="mb-4 text-xl font-semibold text-white">Artists</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {artists.map((artist) => (
              <a
                key={artist.id}
                href={`https://www.youtube.com/channel/${artist.id}`}
                target="_blank"
                rel="noreferrer"
                className="group text-center"
              >
                <img src={artist.thumbnail} alt="" className="mx-auto aspect-square w-full rounded-full object-cover transition group-hover:scale-105" />
                <p className="mt-2 truncate text-sm font-semibold text-white">{artist.title}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {albums.length > 0 && (
        <div className="mt-10">
          <h3 className="mb-4 text-xl font-semibold text-white">Albums & Playlists</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {albums.map((album) => (
              <a
                key={album.id}
                href={`https://www.youtube.com/playlist?list=${album.id}`}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
              >
                <img src={album.thumbnail} alt="" className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105" />
                <p className="truncate p-4 text-sm font-semibold text-white">{album.title}</p>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
