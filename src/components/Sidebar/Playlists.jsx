"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Pin as BsPinAngleFill } from "lucide-react";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import PlaylistItemMenu from "@/components/PlaylistItemMenu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getUserPlaylists } from "@/services/playlistApi";
import { useNav } from "../Layout/AppShell";
import UserMessage from "@/components/UserMessage";
import { toUserError } from "@/utils/userError";
import useAccountScope from "@/hooks/useAccountScope";
import PlaylistCover from "@/components/PlaylistCover";
import LibraryList from "./LibraryList";
import { requestJson } from "@/services/http";
import { followedArtistsForDisplay, followedArtistKey } from "@/utils/followedArtistsList.mjs";
import { artistPageHref } from "@/utils/artistNavigation.mjs";
import { FOLLOWS_CHANGED_EVENT } from "@/utils/accountNotifications.mjs";
import { PLAYLISTS_CHANGED_EVENT, applyPlaylistChange, isCurrentPlaylistEvent } from "@/utils/playlistEvents.mjs";

// Cached across client-side navigations and remounts within the session so the
// sidebar shows the last-known list (or empty state) instantly instead of
// flashing "Loading playlists…" on every route transition.
let cachedPlaylists = null;

const AccountPlaylists = ({ scope, compact }) => {
  const { owner, status } = scope;
  const pathname = usePathname();
  const { setShowNav } = useNav();
  const cached = cachedPlaylists?.key === scope.key && scope.isCurrent() && Date.now() - cachedPlaylists.savedAt < 300_000
    ? cachedPlaylists.data : null;
  const [playlists, setPlaylists] = useState(() => cached ?? []);
  const [loading, setLoading] = useState(() => cached === null);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilter] = useState("all");
  const [artists, setArtists] = useState([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [artistsError, setArtistsError] = useState(false);
  const [artistRefresh, setArtistRefresh] = useState(0);
  const requestGeneration = useRef(0);

  useEffect(() => {
    if (!scope.isCurrent()) return undefined;
    const controller = new AbortController();
    let generation = 0;
    const load = async () => {
      if (!scope.isCurrent()) return;
      const request = ++generation;
      setArtistsLoading(true);
      setArtistsError(false);
      try {
        const json = await requestJson("/api/followedArtists", { signal: controller.signal });
        if (!controller.signal.aborted && request === generation && scope.isCurrent()) {
          setArtists(followedArtistsForDisplay({ followedArtists: json.data, followedArtistsMeta: json.artists }));
        }
      } catch {
        if (!controller.signal.aborted && request === generation && scope.isCurrent()) setArtistsError(true);
      } finally {
        if (!controller.signal.aborted && request === generation && scope.isCurrent()) setArtistsLoading(false);
      }
    };
    void load();
    window.addEventListener(FOLLOWS_CHANGED_EVENT, load);
    return () => { controller.abort(); window.removeEventListener(FOLLOWS_CHANGED_EVENT, load); };
  }, [scope, artistRefresh]);

  const libraryItems = [
    ...(status === "authenticated" && filter !== "artists" ? [{ _id: "liked", name: "Liked Songs", kind: "liked", pinned: true }] : []),
    ...(filter !== "artists" ? playlists : []),
    ...(filter !== "playlists" ? artists.map((artist) => ({ ...artist, _id: followedArtistKey(artist), kind: "artist", createdAt: artist.followedAt, updatedAt: artist.followedAt })) : []),
  ];



  useEffect(() => {
    if (status === "loading") {
      return;
    }
    if (!scope.isCurrent()) {
      cachedPlaylists = null;
      setPlaylists([]);
      setError(toUserError({ code: "UNAUTHORIZED" }));
      setLoading(false);
      return;
    }

    let active = true;
    const getPlaylists = async () => {
      const request = ++requestGeneration.current;
      const current = () => active && request === requestGeneration.current && scope.isCurrent();
      if (cachedPlaylists?.key !== scope.key) setLoading(true);
      setError(null);
      try {
        const res = await getUserPlaylists();
        if (!current()) return;
        if (res?.success === true) {
          const list = Array.isArray(res.data?.playlists)
            ? res.data.playlists.filter(
              (playlist) => playlist && typeof playlist === "object" && playlist._id,
            )
            : [];
          cachedPlaylists = { key: scope.key, data: list, savedAt: Date.now() };
          setPlaylists(list);
        } else {
          const normalized = toUserError(res);
          setError(normalized.code === "UNAUTHORIZED"
            ? normalized
            : toUserError(res, {
              title: "Playlists unavailable",
              message: "We couldn’t load your playlists. Please try again.",
            }));
        }
      } catch (cause) {
        if (current()) setError(toUserError(cause, {
          title: "Playlists unavailable", message: "We couldn’t load your playlists. Please try again.",
        }));
      } finally {
        if (current()) setLoading(false);
      }
    };
    getPlaylists();
    const onChanged = (event) => {
      if (!isCurrentPlaylistEvent(event, scope)) return;
      // Invalidate an in-flight read synchronously, before React re-runs this effect.
      requestGeneration.current += 1;
      if (event.detail?.playlist?._id || event.detail?.deletedId) {
        setPlaylists((current) => {
          if (!scope.isCurrent()) return current;
          const list = applyPlaylistChange(current, event.detail, owner);
          cachedPlaylists = { key: scope.key, data: list, savedAt: Date.now() };
          return list;
        });
        setError(null);
        setLoading(false);
      }
      setRefreshKey((value) => value + 1);
    };
    window.addEventListener(PLAYLISTS_CHANGED_EVENT, onChanged);
    return () => {
      active = false;
      window.removeEventListener(PLAYLISTS_CHANGED_EVENT, onChanged);
    };
  }, [refreshKey, scope, owner, status]);

  if (compact) return <nav className="compact-library" aria-label="Your library shortcuts">
    <Link href="/library/liked" title="Liked Songs" aria-label="Liked Songs" aria-current={pathname === "/library/liked" ? "page" : undefined} className="compact-library-liked"><Heart size={24} fill="currentColor" aria-hidden="true" /></Link>
    {playlists.map((playlist) => <Link key={playlist._id} href={`/library/playlist/${playlist._id}`} title={playlist.name} aria-label={`Open playlist ${playlist.name}`} aria-current={pathname === `/library/playlist/${playlist._id}` ? "page" : undefined} className="compact-library-cover"><PlaylistCover playlist={playlist} className="h-full w-full" /></Link>)}
    {artists.map((artist) => <Link key={followedArtistKey(artist)} href={artistPageHref(artist.channelId, artist.name)} title={artist.name} aria-label={`Open artist ${artist.name}`} className="compact-library-cover sidebar-library-art is-artist">{artist.thumbnail ? <img src={artist.thumbnail} alt="" width={48} height={48} /> : artist.name.slice(0, 1)}</Link>)}
    {loading && <span role="status" aria-label="Loading library" className="h-12 w-12 animate-pulse rounded bg-white/10" />}
    {error?.retryable && <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="min-h-11 text-xs" title="Retry library">Retry</button>}
  </nav>;

  return (
    <>
      <div className="flex min-h-0 flex-col">
        <div className="kasa-library-pills" role="group" aria-label="Filter your library by type">
          {[["all", "All"], ["playlists", "Playlists"], ["artists", "Artists"]].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        {loading && filter !== "artists" ? <p className="px-2 py-3 text-xs text-[var(--muted)]">Loading playlists…</p> : null}
        {!loading && status === "unauthenticated" ? <div className="my-3 rounded-lg bg-[var(--navy-raised)] p-4"><p className="font-bold">Create your first playlist</p><p className="my-3 text-sm">It’s easy. We’ll help you.</p><Link href="/signup" className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-bold text-black">Sign up free</Link></div> : !loading && error ? <div className="px-2 py-2"><UserMessage compact title={error.title} message={error.message} onRetry={error.retryable ? () => setRefreshKey((value) => value + 1) : undefined} href={error.action === "login" ? "/login" : undefined} hrefLabel="Log in" /></div> : null}
        {filter !== "playlists" && artistsLoading && <p role="status" className="px-2 py-3 text-xs text-[var(--muted)]">Loading artists…</p>}
        {filter !== "playlists" && artistsError && <div className="px-2 py-2"><UserMessage compact title="Artists unavailable" message="We couldn’t load the artists you follow." onRetry={() => setArtistRefresh((value) => value + 1)} /></div>}
        {filter === "artists" && !artistsLoading && !artistsError && !artists.length && status === "authenticated" && <p role="status" className="px-2 py-4 text-sm text-[var(--muted)]">Artists you follow will appear here. <Link href="/search" onClick={() => setShowNav(false)} className="underline">Find artists</Link></p>}
        {libraryItems.length > 0 && <LibraryList playlists={libraryItems} owner={owner}>{(playlist) => playlist.kind ? (
          <div key={playlist._id} className="sidebar-library-item">
            <Link href={playlist.kind === "liked" ? "/library/liked" : artistPageHref(playlist.channelId, playlist.name)} onClick={() => setShowNav(false)} aria-current={(playlist.kind === "liked" ? pathname === "/library/liked" : playlist.channelId && pathname === `/artist/${playlist.channelId}`) ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2">
              <span className={`sidebar-library-art ${playlist.kind === "artist" ? "is-artist" : "is-liked"}`} aria-hidden="true">{playlist.thumbnail ? <img src={playlist.thumbnail} alt="" width={48} height={48} onError={(event) => { if (!event.currentTarget.src.endsWith("/icon-192x192.png")) event.currentTarget.src = "/icon-192x192.png"; }} /> : playlist.kind === "liked" ? <Heart size={24} fill="currentColor" /> : playlist.name.slice(0, 1)}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{playlist.name}</span><span className="mt-1 block truncate text-xs text-[var(--muted)]">{playlist.kind === "liked" ? "Pinned · Your saved songs" : "Artist"}</span></span>
            </Link>
          </div>
        ) : (
          <ContextMenuTarget key={playlist._id} className="group flex items-center justify-between rounded-lg pr-1 hover:bg-[var(--navy-panel)]">
            <Link data-library-playlist="true" href={`/library/playlist/${playlist._id}`} onClick={() => setShowNav(false)} aria-current={pathname === `/library/playlist/${playlist._id}` ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2">
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md"><PlaylistCover playlist={playlist} className="h-full w-full" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{playlist.name}</span><span className="mt-1 flex items-center gap-1 truncate text-xs text-[var(--muted)]">{playlist.pinned && <BsPinAngleFill size="1em" fill="currentColor" aria-label="Pinned" className="shrink-0 text-[var(--accent)]" />}Playlist · {playlist.user?.userName || "You"}</span></span>
            </Link>
            <PlaylistItemMenu playlist={playlist} />
          </ContextMenuTarget>
        )}</LibraryList>}
      </div>
    </>
  );
};
const Playlists = ({ compact = false }) => {
  const scope = useAccountScope();
  return <AccountPlaylists key={scope.key} scope={scope} compact={compact} />;
};
export default Playlists;

