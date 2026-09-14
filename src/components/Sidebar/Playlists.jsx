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
import styles from "./playlistRows.module.css";

// Cached across client-side navigations and remounts within the session so the
// sidebar shows the last-known list (or empty state) instantly instead of
// flashing "Loading playlists\u2026" on every route transition.
let cachedPlaylists = null;

const AccountPlaylists = ({ owner, status, query = "", layout = "list" }) => {
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
              message: "We couldn\u2019t load your playlists. Please try again.",
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
          message: "We couldn\u2019t delete that playlist. Please try again.",
        });
      setDeleteError(userError);
      toast.error(userError.message);
    }
  };

  const visiblePlaylists = playlists.filter((item) => String(item.name || "").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <>
    <div className={styles.heading}>
      <p><MdPlaylistPlay aria-hidden="true" /> Playlists</p>
      <button type="button" onClick={() => setShow(true)} aria-label="Create playlist"><FaPlus aria-hidden="true" /></button>
    </div>
    {loading && <p role="status" className={styles.message}>Loading playlists...</p>}
    {!loading && error && <UserMessage compact title={error.title} message={error.message}
      onRetry={error.retryable ? () => setRefreshKey((value) => value + 1) : undefined}
      href={error.action === "login" ? "/login" : undefined} hrefLabel="Log in" />}
    {!loading && !error && deleteError && <UserMessage compact title={deleteError.title} message={deleteError.message}
      href={deleteError.action === "login" ? "/login" : undefined} hrefLabel="Log in" />}
    {!loading && !error && playlists.length === 0 && <EmptyState title="No playlists yet" message="Create one to keep songs together." actionLabel="Create playlist" onAction={() => setShow(true)} />}
    {!loading && !error && playlists.length > 0 && !visiblePlaylists.length && <p role="status" className={styles.message}>No playlists match your search.</p>}
    <div className={`${styles.rows} ${layout === "grid" ? styles.grid : ""}`} data-testid="sidebar-playlists" data-view={layout}>
      {!loading && !error && visiblePlaylists.map((playlist) => <div key={playlist._id} className={styles.row}>
        <Link href={`/library/playlist/${playlist._id}`} onClick={() => setShowNav(false)} className={styles.link}>
          <div className={styles.cover}><PlaylistCover playlist={playlist} /></div>
          <span className={styles.copy}><strong>{playlist.name}</strong><small>{playlist.pinned ? "Pinned | " : ""}Playlist</small></span>
        </Link>
        <div className={styles.options}>
          <button type="button" aria-label={`Playlist options for ${playlist.name}`} onClick={() => setShowMenu(playlist._id)}><PiDotsThreeVerticalBold size={18} /></button>
          {showMenu === playlist._id && <button type="button" disabled={deletingId === playlist._id}
            onClick={() => { setShowMenu(false); handleDelete(playlist._id); }} className={styles.delete}>
            Delete <MdOutlineDeleteOutline size={14} />
          </button>}
        </div>
      </div>)}
    </div>
    <PlaylistModal show={show} setShow={setShow} onCreated={() => setRefreshKey((value) => value + 1)} />
    {showMenu && <button type="button" aria-label="Close playlist options" onClick={() => setShowMenu(false)} className="fixed inset-0 z-30 cursor-default" />}
  </>;
};

const Playlists = ({ query = "", layout = "list" }) => {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  return <AccountPlaylists key={owner || status} owner={owner} status={status} query={query} layout={layout} />;
};
export default Playlists;
