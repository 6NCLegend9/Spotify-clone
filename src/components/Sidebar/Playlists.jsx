"use client";

import { useEffect, useRef, useState } from "react";
import { FaPlus } from "react-icons/fa";
import { MdPlaylistPlay, MdOutlineDeleteOutline } from "react-icons/md";
import { PiDotsThreeVerticalBold } from "react-icons/pi";
import Link from "next/link";
import PlaylistModal from "./PlaylistModal";
import { deletePlaylist, getUserPlaylists } from "@/services/playlistApi";
import { useNav } from "../Layout/AppShell";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { toUserError } from "@/utils/userError";
import { toast } from "react-hot-toast";
import { useSession } from "next-auth/react";
import { accountOwner } from "@/utils/accountCache.mjs";
import PlaylistCover from "@/components/PlaylistCover";
import LibraryList from "./LibraryList";

// Cached across client-side navigations and remounts within the session so the
// sidebar shows the last-known list (or empty state) instantly instead of
// flashing "Loading playlists…" on every route transition.
let cachedPlaylists = null;

const AccountPlaylists = ({ owner, status }) => {
  const { setShowNav } = useNav();
  const cached = cachedPlaylists?.owner === owner && Date.now() - cachedPlaylists.savedAt < 300_000
    ? cachedPlaylists.data : null;
  const live = useRef(true);
  const [show, setShow] = useState(false);
  const [playlists, setPlaylists] = useState(() => cached ?? []);
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(() => cached === null);
  const [error, setError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

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
    const onChanged = () => { cachedPlaylists = null; setRefreshKey((value) => value + 1); };
    window.addEventListener("heykasa:playlists-changed", onChanged);
    return () => {
      active = false;
      window.removeEventListener("heykasa:playlists-changed", onChanged);
    };
  }, [refreshKey, status, owner]);

  const handleDelete = async (id) => {
    if (deletingId) return;
    const previousPlaylists = playlists;
    setDeleteError(null);
    setDeletingId(id);
    const nextPlaylists = previousPlaylists.filter((playlist) => playlist._id !== id);
    cachedPlaylists = { owner, data: nextPlaylists, savedAt: Date.now() };
    setPlaylists(nextPlaylists);
    const res = await deletePlaylist(id);
    if (!live.current) return;
    setDeletingId(null);
    if (res?.success === true) {
      toast.success("Playlist deleted");
    } else {
      cachedPlaylists = { owner, data: previousPlaylists, savedAt: Date.now() };
      setPlaylists(previousPlaylists);
      const normalized = toUserError(res);
      const userError = normalized.code === "UNAUTHORIZED"
        ? normalized
        : toUserError(res, {
          title: "Playlist not deleted",
          message: "We couldn’t delete that playlist. Please try again.",
        });
      setDeleteError(userError);
      toast.error(userError.message);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-2 py-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><MdPlaylistPlay aria-hidden="true" className="text-lg" />Your Library</p>
        <button type="button" onClick={() => setShow(true)} className="icon-btn h-11 w-11" aria-label="Create playlist"><FaPlus aria-hidden="true" className="text-xs" /></button>
      </div>
      <div className="flex min-h-0 flex-col">
        {loading ? <p className="px-2 py-3 text-xs text-[var(--muted)]">Loading playlists…</p> : null}
        {!loading && error ? <div className="px-2 py-2"><UserMessage compact title={error.title} message={error.message} onRetry={error.retryable ? () => setRefreshKey((value) => value + 1) : undefined} href={error.action === "login" ? "/login" : undefined} hrefLabel="Log in" /></div> : null}
        {!loading && !error && deleteError ? <div className="px-2 py-2"><UserMessage compact title={deleteError.title} message={deleteError.message} href={deleteError.action === "login" ? "/login" : undefined} hrefLabel="Log in" /></div> : null}
        {!loading && !error && playlists.length === 0 ? <div className="px-2 py-2"><EmptyState title="No playlists yet" message="Create one to keep songs together." actionLabel="Create playlist" onAction={() => setShow(true)} /></div> : null}
        {!loading && !error && <LibraryList playlists={playlists}>{(playlist) => (
          <div key={playlist._id} className="group flex items-center justify-between rounded-lg pr-1 hover:bg-[var(--navy-panel)]">
            <Link href={`/library/playlist/${playlist._id}`} onClick={() => setShowNav(false)} className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2">
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md"><PlaylistCover playlist={playlist} className="h-full w-full" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{playlist.name}</span><span className="mt-1 block truncate text-xs text-[var(--teal)]">Playlist</span></span>
            </Link>
            <div className="relative">
              <button type="button" aria-label={`Playlist options for ${playlist.name}`} onClick={() => setShowMenu(playlist._id)} className="grid h-9 w-9 place-items-center text-[var(--muted)] hover:text-white"><PiDotsThreeVerticalBold size={18} /></button>
              {showMenu === playlist._id && <button type="button" disabled={deletingId === playlist._id} onClick={() => { setShowMenu(false); handleDelete(playlist._id); }} className="absolute right-0 top-8 z-50 flex items-center gap-1 rounded-lg border border-white/10 bg-[var(--navy-raised)] px-3 py-2 text-xs text-white shadow-xl hover:bg-[var(--navy-panel)]">Delete <MdOutlineDeleteOutline size={14} /></button>}
            </div>
          </div>
        )}</LibraryList>}
      </div>
      <PlaylistModal show={show} setShow={setShow} onCreated={() => setRefreshKey((value) => value + 1)} />
      {showMenu && <button type="button" aria-label="Close playlist options" onClick={() => setShowMenu(false)} className="fixed inset-0 z-30 cursor-default" />}
    </>
  );
};
const Playlists = () => {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  return <AccountPlaylists key={owner || status} owner={owner} status={status} />;
};
export default Playlists;
