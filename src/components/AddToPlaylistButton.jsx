"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiPlus } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { addSongToPlaylist, getUserPlaylists } from "@/services/playlistApi";

export default function AddToPlaylistButton({ track, className = "" }) {
  const { status } = useSession();
  const router = useRouter();
  const buttonRef = useRef(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const [playlists, setPlaylists] = useState(null);
  const [loading, setLoading] = useState(false);

  const openMenu = async (event) => {
    event.stopPropagation();
    if (status !== "authenticated") {
      router.push("/login");
      return;
    }
    if (!track?.id) return;

    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
    setShowMenu(true);
    if (playlists === null) {
      setLoading(true);
      const res = await getUserPlaylists();
      setPlaylists(res?.success ? res.data.playlists : []);
      setLoading(false);
    }
  };

  const handleAdd = async (playlist) => {
    const res = await addSongToPlaylist(playlist._id, track.id);
    if (res?.success) toast.success(`Added to ${playlist.name}`);
    else toast.error(res?.message || "Could not add to playlist");
    setShowMenu(false);
  };

  return (
    <div ref={buttonRef} className="relative inline-block">
      <button
        type="button"
        aria-label="Add to playlist"
        title="Add to playlist"
        onClick={openMenu}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-300 transition hover:bg-white/10 ${className}`}
      >
        <FiPlus />
      </button>
      {showMenu && menuPosition && typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setShowMenu(false)} />
            <div
              onClick={(event) => event.stopPropagation()}
              style={{ position: "fixed", top: menuPosition.top, right: menuPosition.right }}
              className="z-[9999] w-56 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-[#1a1a2e] p-2 shadow-xl"
            >
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white/50">Add to playlist</p>
              {loading && <p className="px-2 py-2 text-xs text-gray-400">Loading...</p>}
              {!loading && playlists?.length === 0 && <p className="px-2 py-2 text-xs text-gray-400">Create a playlist first.</p>}
              {!loading && playlists?.map((playlist) => (
                <button
                  key={playlist._id}
                  type="button"
                  onClick={() => handleAdd(playlist)}
                  className="block w-full truncate rounded-md px-2 py-2 text-left text-sm text-white hover:bg-white/10 hover:text-[#00e6e6]"
                >
                  {playlist.name}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
