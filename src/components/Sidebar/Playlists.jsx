"use client";

import { useEffect, useState } from "react";
import { BsPinAngleFill } from "react-icons/bs";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import PlaylistItemMenu from "@/components/PlaylistItemMenu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getUserPlaylists } from "@/services/playlistApi";
import { useNav } from "../Layout/AppShell";
import UserMessage from "@/components/UserMessage";
import { toUserError } from "@/utils/userError";
import { useSession } from "next-auth/react";
import { accountOwner } from "@/utils/accountCache.mjs";
import PlaylistCover from "@/components/PlaylistCover";
import LibraryList from "./LibraryList";

// Cached across client-side navigations and remounts within the session so the
// sidebar shows the last-known list (or empty state) instantly instead of
// flashing "Loading playlists…" on every route transition.
let cachedPlaylists = null;

const AccountPlaylists = ({ owner, status, compact }) => {
  const pathname = usePathname();
  const { setShowNav } = useNav();
  const cached = cachedPlaylists?.owner === owner && Date.now() - cachedPlaylists.savedAt < 300_000
    ? cachedPlaylists.data : null;
  const [playlists, setPlaylists] = useState(() => cached ?? []);
  const [loading, setLoading] = useState(() => cached === null);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);


  useEffect(() => {
    if (status === "loading") {
      return;
    }
    if (status !== "authenticated" || !owner) {
      cachedPlaylists = null;
      setPlaylists([]);
      setError(toUserError({ code: "UNAUTHORIZED" }));
      setLoading(false);
      return;
    }

    let active = true;
    const getPlaylists = async () => {
      if (cachedPlaylists?.owner !== owner) setLoading(true);
      setError(null);
      try {
        const res = await getUserPlaylists();
        if (!active) return;
        if (res?.success === true) {
          const list = Array.isArray(res.data?.playlists)
            ? res.data.playlists.filter(
              (playlist) => playlist && typeof playlist === "object" && playlist._id,
            )
            : [];
          cachedPlaylists = { owner, data: list, savedAt: Date.now() };
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
      } finally {
        if (active) setLoading(false);
      }
    };
    getPlaylists();
    const onChanged = (event) => {
      if (event.detail?.owner && event.detail.owner !== owner) return;
      const created = event.detail?.playlist;
      if (created?._id) {
        setPlaylists((current) => {
          const list = [created, ...current.filter((item) => item._id !== created._id)];
          cachedPlaylists = { owner, data: list, savedAt: Date.now() };
          return list;
        });
        setError(null);
      }
      setRefreshKey((value) => value + 1);
    };
    window.addEventListener("heykasa:playlists-changed", onChanged);
    return () => {
      active = false;
      window.removeEventListener("heykasa:playlists-changed", onChanged);
    };
  }, [refreshKey, status, owner]);

  if (compact) return <nav className="compact-library" aria-label="Your library shortcuts">
    <Link href="/library/liked" title="Liked Songs" aria-label="Liked Songs" aria-current={pathname === "/library/liked" ? "page" : undefined} className="compact-library-liked"><span aria-hidden="true">♥</span></Link>
    {playlists.map((playlist) => <Link key={playlist._id} href={`/library/playlist/${playlist._id}`} title={playlist.name} aria-label={`Open playlist ${playlist.name}`} aria-current={pathname === `/library/playlist/${playlist._id}` ? "page" : undefined} className="compact-library-cover"><PlaylistCover playlist={playlist} className="h-full w-full" /></Link>)}
    {loading && <span role="status" aria-label="Loading library" className="h-12 w-12 animate-pulse rounded bg-white/10" />}
    {error?.retryable && <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="min-h-11 text-xs" title="Retry library">Retry</button>}
  </nav>;

  return (
    <>
      <div className="flex min-h-0 flex-col">
        {status === "authenticated" && <Link href="/library/liked" onClick={() => setShowNav(false)} className="mb-2 flex min-h-16 items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--navy-panel)]"><span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[var(--navy-panel)] text-xl text-[var(--accent)]">♥</span><span><span className="block text-sm font-semibold">Liked Songs</span><span className="block text-xs text-[var(--muted)]">Your saved songs</span></span></Link>}
        {loading ? <p className="px-2 py-3 text-xs text-[var(--muted)]">Loading playlists…</p> : null}
        {!loading && status === "unauthenticated" ? <div className="my-3 rounded-lg bg-[var(--navy-raised)] p-4"><p className="font-bold">Create your first playlist</p><p className="my-3 text-sm">It’s easy. We’ll help you.</p><Link href="/signup" className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-bold text-black">Sign up free</Link></div> : !loading && error ? <div className="px-2 py-2"><UserMessage compact title={error.title} message={error.message} onRetry={error.retryable ? () => setRefreshKey((value) => value + 1) : undefined} href={error.action === "login" ? "/login" : undefined} hrefLabel="Log in" /></div> : null}
        {!error && playlists.length > 0 && <LibraryList playlists={playlists} owner={owner}>{(playlist) => (
          <ContextMenuTarget key={playlist._id} className="group flex items-center justify-between rounded-lg pr-1 hover:bg-[var(--navy-panel)]">
            <Link data-library-playlist="true" href={`/library/playlist/${playlist._id}`} onClick={() => setShowNav(false)} aria-current={pathname === `/library/playlist/${playlist._id}` ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2">
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md"><PlaylistCover playlist={playlist} className="h-full w-full" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{playlist.name}</span><span className="mt-1 flex items-center gap-1 truncate text-xs text-[var(--muted)]">{playlist.pinned && <BsPinAngleFill aria-label="Pinned" className="shrink-0 text-[var(--accent)]" />}Playlist · {playlist.user?.userName || "You"}</span></span>
            </Link>
            <PlaylistItemMenu playlist={playlist} />
          </ContextMenuTarget>
        )}</LibraryList>}
      </div>
    </>
  );
};
const Playlists = ({ compact = false }) => {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  return <AccountPlaylists key={owner || status} owner={owner} status={status} compact={compact} />;
};
export default Playlists;

