"use client";

import { useEffect, useState } from "react";
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

const Playlists = () => {
  const { setShowNav } = useNav();
  const { status } = useSession();
  const [show, setShow] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }
    if (status !== "authenticated") {
      setPlaylists([]);
      setError(toUserError({ code: "UNAUTHORIZED" }));
      setLoading(false);
      return;
    }

    let active = true;
    const getPlaylists = async () => {
      setLoading(true);
      setError(null);
      const res = await getUserPlaylists();
      if (!active) return;
      if (res?.success === true) {
        setPlaylists(
          Array.isArray(res.data?.playlists)
            ? res.data.playlists.filter(
              (playlist) => playlist && typeof playlist === "object" && playlist._id,
            )
            : [],
        );
      } else {
        const normalized = toUserError(res);
        setError(normalized.code === "UNAUTHORIZED"
          ? normalized
          : toUserError(res, {
            title: "Playlists unavailable",
            message: "We couldn’t load your playlists. Please try again.",
          }));
      }
      setLoading(false);
    };
    getPlaylists();
    return () => {
      active = false;
    };
  }, [refreshKey, status]);

  const handleDelete = async (id) => {
    if (deletingId) return;
    const previousPlaylists = playlists;
    setDeleteError(null);
    setDeletingId(id);
    setPlaylists((current) => current.filter((playlist) => playlist._id !== id));
    const res = await deletePlaylist(id);
    setDeletingId(null);
    if (res?.success === true) {
      toast.success("Playlist deleted");
    } else {
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
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <MdPlaylistPlay aria-hidden="true" className="text-lg" />
          Playlists
        </p>
        <button
          type="button"
          onClick={() => setShow(true)}
          className="icon-btn h-8 w-8"
          aria-label="Create playlist"
        >
          <FaPlus className="text-xs" />
        </button>
      </div>
      <div
        className={`flex flex-col ${
          !loading && !error && playlists.length > 0 ? "max-h-52 overflow-y-auto" : ""
        }`}
      >
        {loading ? <p className="px-2 py-3 text-xs text-[#9aa8b5]">Loading playlists…</p> : null}
        {!loading && error ? (
          <div className="px-2 py-2">
            <UserMessage
              compact
              title={error.title}
              message={error.message}
              onRetry={error.retryable ? () => setRefreshKey((value) => value + 1) : undefined}
              href={error.action === "login" ? "/login" : undefined}
              hrefLabel="Log in"
            />
          </div>
        ) : null}
        {!loading && !error && deleteError ? (
          <div className="px-2 py-2">
            <UserMessage
              compact
              title={deleteError.title}
              message={deleteError.message}
              href={deleteError.action === "login" ? "/login" : undefined}
              hrefLabel="Log in"
            />
          </div>
        ) : null}
        {!loading && !error && playlists.length === 0 ? (
          <div className="px-2 py-2">
            <EmptyState
              title="No playlists yet"
              message="Create one to keep songs together."
              actionLabel="Create playlist"
              onAction={() => setShow(true)}
            />
          </div>
        ) : null}
        {!loading && !error && playlists.map((playlist) => (
          <div
            key={playlist._id}
            className="group flex items-center justify-between rounded-lg pr-1 hover:bg-white/5"
          >
            <Link
              href={`/library/playlist/${playlist._id}`}
              onClick={() => setShowNav(false)}
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2"
            >
              <MdPlaylistPlay className="shrink-0 text-[#00e6e6]" />
              <p className="truncate text-sm text-white">{playlist.name}</p>
            </Link>
            <div className="relative">
              <button
                type="button"
                aria-label={`Playlist options for ${playlist.name}`}
                onClick={() => setShowMenu(playlist._id)}
                className="grid h-8 w-8 place-items-center text-[#9aa8b5] hover:text-white"
              >
                <PiDotsThreeVerticalBold size={18} />
              </button>
              {showMenu === playlist._id && (
                <button
                  type="button"
                  disabled={deletingId === playlist._id}
                  onClick={() => {
                    setShowMenu(false);
                    handleDelete(playlist._id);
                  }}
                  className="absolute right-0 top-8 z-50 flex items-center gap-1 rounded-lg border border-white/10 bg-[#07121d] px-3 py-2 text-xs text-white shadow-xl hover:bg-white/10"
                >
                  Delete <MdOutlineDeleteOutline size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <PlaylistModal
        show={show}
        setShow={setShow}
        onCreated={() => setRefreshKey((value) => value + 1)}
      />
      {showMenu && (
        <button
          type="button"
          aria-label="Close playlist options"
          onClick={() => setShowMenu(false)}
          className="fixed inset-0 z-30 cursor-default"
        />
      )}
    </>
  );
};

export default Playlists;
