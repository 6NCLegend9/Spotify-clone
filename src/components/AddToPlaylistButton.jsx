"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus as FiPlus } from "lucide-react";
import { toast } from "react-hot-toast";
import { addSongToPlaylist, getUserPlaylists } from "@/services/playlistApi";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { toUserError } from "@/utils/userError";
import { loginPath } from "@/utils/appOrigin.mjs";
import { placeAnchoredMenu } from "@/utils/anchoredMenu.mjs";
import { getFocusableElements } from "@/hooks/useFocusTrap";
import useAccountScope from "@/hooks/useAccountScope";

const menuItemClass = "block min-h-11 w-full truncate rounded-md px-2 py-2 text-left text-sm text-white hover:bg-[var(--navy-panel)] hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50";

export default function AddToPlaylistButton(props) {
  const scope = useAccountScope();
  return <AccountAddToPlaylistButton key={scope.key} {...props} scope={scope} />;
}

function AccountAddToPlaylistButton({ track, className = "", scope }) {
  const { status } = scope;
  const router = useRouter();
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const [playlists, setPlaylists] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [addingId, setAddingId] = useState(null);

  useEffect(() => {
    if (!showMenu) return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const bounds = menuRef.current?.getBoundingClientRect();
      setMenuPosition(placeAnchoredMenu({
        trigger: rect,
        menuHeight: bounds?.height || 280,
        menuWidth: bounds?.width || 224,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        gap: 6,
      }));
    };
    const key = (event) => {
      const inside = menuRef.current?.contains(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setShowMenu(false);
        buttonRef.current?.focus();
      } else if (event.key === "Tab") {
        // Keep normal page Tab order after this non-modal portal closes.
        if (inside) buttonRef.current?.focus();
        setShowMenu(false);
      } else if (inside && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = getFocusableElements(menuRef.current);
        if (!items.length) return;
        const index = items.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    };
    place();
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [showMenu, loading, loadError, playlists]);

  useEffect(() => {
    if (!showMenu || !menuRef.current) return;
    // Loading/empty states need a real focus target too. Replace it with the
    // first available action when results or recovery controls arrive.
    if (menuRef.current.contains(document.activeElement) || document.activeElement === document.body
      || document.activeElement === buttonRef.current) {
      (getFocusableElements(menuRef.current)[0] || menuRef.current).focus();
    }
  }, [showMenu, loading, loadError, playlists, addingId]);

  const loadPlaylists = async () => {
    if (loading || !scope.isCurrent()) return;
    setLoading(true);
    setLoadError(null);
    const res = await getUserPlaylists();
    if (!scope.isCurrent()) return;
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
    if (status === "loading") {
      toast("Loading your account…");
      return;
    }
    if (status !== "authenticated") {
      toast.error("Log in to add songs to a playlist.");
      router.push(loginPath(window.location.href, window.location.origin));
      return;
    }
    if (!track?.id || !scope.isCurrent()) return;

    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition(placeAnchoredMenu({ trigger: rect, menuHeight: 280, menuWidth: 224,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, gap: 6 }));
    setShowMenu(true);
    if (playlists === null) {
      await loadPlaylists();
    }
  };

  const handleAdd = async (playlist) => {
    if (addingId || !playlist?._id || !track?.id || !scope.isCurrent()) return;
    setAddingId(playlist._id);
    const res = await addSongToPlaylist(playlist._id, track.id, track.duration);
    if (!scope.isCurrent()) return;
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
    if (menuRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    setShowMenu(false);
  };

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Add to playlist"
        title="Add to playlist"
        aria-expanded={showMenu}
        aria-haspopup="menu"
        aria-controls={showMenu ? menuId : undefined}
        onClick={openMenu}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-gray-300 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${className}`}
      >
        <FiPlus size="1em" aria-hidden="true" />
      </button>
      {showMenu && menuPosition && typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close playlist menu"
              className="fixed inset-0 z-[9998] cursor-default"
              onClick={(event) => { event.stopPropagation(); setShowMenu(false); buttonRef.current?.focus(); }}
            />
            <div
              ref={menuRef}
              id={menuId}
              tabIndex={-1}
              role="menu"
              aria-label="Add to playlist"
              aria-busy={loading || Boolean(addingId)}
              onClick={(event) => event.stopPropagation()}
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
              }}
              className="z-[9999] w-56 max-w-[calc(100vw-16px)] max-h-[min(288px,calc(100vh-16px))] overflow-y-auto rounded-lg border border-[var(--hairline)] bg-[var(--navy-raised)] p-2 shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white/50">Add to playlist</p>
              {loading && <p role="status" className="px-2 py-2 text-xs text-gray-400">Loading playlists…</p>}
              {!loading && loadError && (
                <>
                  <UserMessage compact title={loadError.title} message={loadError.message} />
                  <button type="button" role="menuitem" onClick={loadPlaylists} className={menuItemClass}>Try again</button>
                  {loadError.action === "login" && <Link href="/login" role="menuitem" className={menuItemClass}>Log in</Link>}
                </>
              )}
              {!loading && !loadError && playlists?.length === 0 && <div role="status">
                <EmptyState
                  title="No playlists yet"
                  message="Create a playlist from Your Library first."
                />
              </div>}
              {!loading && !loadError && playlists?.map((playlist) => (
                <button
                  key={playlist._id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleAdd(playlist)}
                  disabled={Boolean(addingId)}
                  className={menuItemClass}
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
