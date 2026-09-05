"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiPlus } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { addSongToPlaylist, getUserPlaylists } from "@/services/playlistApi";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { toUserError } from "@/utils/userError";

export default function AddToPlaylistButton({ track, className = "" }) {
  const { status } = useSession();
  const router = useRouter();
  const buttonRef = useRef(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const [playlists, setPlaylists] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [addingId, setAddingId] = useState(null);

  const loadPlaylists = async () => {
    setLoading(true);
    setLoadError(null);
    const res = await getUserPlaylists();
    if (res?.success) {
      setPlaylists(
        Array.isArray(res.data?.playlists)
          ? res.data.playlists.filter(
            (playlist) => playlist && typeof playlist === "object" && playlist._id,
          )
          : [],
      );
    } else {
      setPlaylists(null);
      const normalized = toUserError(res);
      setLoadError(normalized.code === "UNAUTHORIZED"
        ? normalized
        : toUserError(res, {
          title: "Playlists unavailable",
          message: "We couldn’t load your playlists. Please try again.",
        }));
    }
    setLoading(false);
  };

  const openMenu = async (event) => {
    event.stopPropagation();
    if (status !== "authenticated") {
      toast.error("Log in to add songs to a playlist.");
      router.push("/login");
      return;
    }
    if (!track?.id) return;

    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const openUp = window.innerHeight - rect.bottom < 280;
    const MENU_WIDTH = 224; // matches w-56
    const maxRight = Math.max(8, window.innerWidth - MENU_WIDTH - 8);
    setMenuPosition({
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      right: Math.min(Math.max(8, window.innerWidth - rect.right), maxRight),
    });
    setShowMenu(true);
    if (playlists === null) {
      await loadPlaylists();
    }
  };

  const handleAdd = async (playlist) => {
    if (addingId || !playlist?._id || !track?.id) return;
    setAddingId(playlist._id);
    const res = await addSongToPlaylist(playlist._id, track.id);
    setAddingId(null);
    if (res?.success) toast.success(`Added to ${playlist.name || "playlist"}`);
    else {
      const normalized = toUserError(res);
      toast.error((normalized.code === "UNAUTHORIZED"
        ? normalized
        : toUserError(res, {
          title: "Song not added",
          message: "We couldn’t add that song. Please try again.",
        })).message);
    }
    setShowMenu(false);
  };

  return (
    <div ref={buttonRef} className="relative inline-block">
      <button
        type="button"
        aria-label="Add to playlist"
        title="Add to playlist"
        aria-expanded={showMenu}
        aria-haspopup="menu"
        onClick={openMenu}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-300 transition hover:bg-white/10 ${className}`}
      >
        <FiPlus aria-hidden="true" />
      </button>
      {showMenu && menuPosition && typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close playlist menu"
              className="fixed inset-0 z-[9998] cursor-default"
              onClick={() => setShowMenu(false)}
            />
            <div
              role="menu"
              aria-label="Add to playlist"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Escape") setShowMenu(false);
              }}
              style={{
                position: "fixed",
                top: menuPosition.top,
                bottom: menuPosition.bottom,
                right: menuPosition.right,
              }}
              className="z-[9999] w-56 max-w-[calc(100vw-16px)] max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-[#1a1a2e] p-2 shadow-xl"
            >
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white/50">Add to playlist</p>
              {loading && <p className="px-2 py-2 text-xs text-gray-400">Loading playlists…</p>}
              {!loading && loadError && (
                <UserMessage
                  compact
                  title={loadError.title}
                  message={loadError.message}
                  onRetry={loadPlaylists}
                  href={loadError.action === "login" ? "/login" : undefined}
                  hrefLabel="Log in"
                />
              )}
              {!loading && !loadError && playlists?.length === 0 && (
                <EmptyState
                  title="No playlists yet"
                  message="Create a playlist from Your Library first."
                />
              )}
              {!loading && !loadError && playlists?.map((playlist) => (
                <button
                  key={playlist._id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleAdd(playlist)}
                  disabled={Boolean(addingId)}
                  className="block w-full truncate rounded-md px-2 py-2 text-left text-sm text-white hover:bg-white/10 hover:text-[#00e6e6]"
                >
                  {addingId === playlist._id ? "Adding…" : playlist.name || "Untitled playlist"}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
