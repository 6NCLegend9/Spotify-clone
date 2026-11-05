"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import {
  ChevronLeft as FiChevronLeft,
  ChevronRight as FiChevronRight,
  ArrowUp,
  ArrowDown,
  Ellipsis as FiMoreHorizontal,
  CirclePlay as FiPlayCircle,
  Plus as FiPlus,
  ListPlus as BiAddToQueue,
} from "lucide-react";

import {
  addToQueue,
  playNextToQueue,
  startYoutubePlayback,
} from "@/redux/features/playerSlice";
import { getUserPlaylists } from "@/services/playlistApi";
import { loginPath } from "@/utils/appOrigin.mjs";
import { toUserError } from "@/utils/userError";
import { placeAnchoredMenu } from "@/utils/anchoredMenu.mjs";
import useAccountScope from "@/hooks/useAccountScope";
import usePlaylistAddition from "@/hooks/usePlaylistAddition";
import PlaylistDuplicateDialog from "@/components/PlaylistDuplicateDialog";
import PlaylistModal from "@/components/Sidebar/PlaylistModal";

const MENU_WIDTH = 224;
const ACTIONS_HEIGHT = 156;
const PLAYLISTS_HEIGHT = 320;

export default function TrackQueueMenu(props) {
  const scope = useAccountScope();
  return <AccountTrackQueueMenu key={scope.key} {...props} scope={scope} />;
}

function AccountTrackQueueMenu({ track, className = "", buttonLabel = "Track options", onRemove, removeLabel = "Remove", onMoveUp, onMoveDown, scope }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const { status } = scope;
  const youtubeVideo = useSelector((state) => state.player.youtubeVideo);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("actions");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [playlists, setPlaylists] = useState(null);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [playlistError, setPlaylistError] = useState("");
  const [creating, setCreating] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const closeMenu = () => {
    if (menuRef.current && (menuRef.current.contains(document.activeElement)
      || document.activeElement === document.body)) buttonRef.current?.focus();
    setOpen(false);
    setView("actions");
    setPlaylistError("");
  };
  const addition = usePlaylistAddition(scope, closeMenu);
  const addingPlaylistId = addition.addingId;
  const unavailable = track?.unavailable === true || track?.playable === false;

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition(placeAnchoredMenu({
        trigger: rect,
        menuHeight: menuRef.current?.getBoundingClientRect().height || (view === "playlists" ? PLAYLISTS_HEIGHT : ACTIONS_HEIGHT),
        menuWidth: MENU_WIDTH,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        gap: 6,
      }));
    };
    const close = (event) => {
      if (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      closeMenu();
    };
    const key = (event) => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && menuRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        const items = [...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
        const index = items.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus(); return;
      }
      if (event.key === "Tab") { closeMenu(); return; }
      if (event.key !== "Escape") return;
      // Consume Escape so a parent dialog (e.g. the queue) does not close too.
      event.preventDefault();
      event.stopPropagation();
      if (view === "playlists") {
        setView("actions");
        return;
      }
      closeMenu();
      buttonRef.current?.focus();
    };
    place();
    menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, view, loadingPlaylists, playlistError, playlists]);

  if (!track?.id) return null;

  const startIfIdle = () => {
    if (youtubeVideo?.id) return false;
    dispatch(startYoutubePlayback({
      queue: [track],
      track,
      queueMode: "radio",
      context: {
        type: "radio",
        id: track.id,
        name: track.title || "Track radio",
      },
    }));
    toast.success("Playing now");
    closeMenu();
    return true;
  };

  const playNext = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (unavailable || !scope.isCurrentView()) return;
    if (startIfIdle()) return;
    dispatch(playNextToQueue(track));
    toast.success("Playing next");
    closeMenu();
  };

  const add = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (unavailable || !scope.isCurrentView()) return;
    if (startIfIdle()) return;
    // Deliberate queue additions are occurrences, not unique songs. Spotify-like
    // queues allow the same recording to be added twice on purpose.
    dispatch(addToQueue(track));
    toast.success("Added to queue");
    closeMenu();
  };

  const loadPlaylists = async () => {
    if (loadingPlaylists || !scope.isCurrent()) return;
    setLoadingPlaylists(true);
    setPlaylistError("");
    const response = await getUserPlaylists();
    if (!scope.isCurrent()) return;
    if (response?.success) {
      const list = Array.isArray(response.data?.playlists)
        ? response.data.playlists.filter((playlist) => playlist && typeof playlist === "object" && playlist._id)
        : [];
      setPlaylists(list);
    } else {
      const error = toUserError(response, {
        title: "Playlists unavailable",
        message: "We couldn’t load your playlists. Please try again.",
      });
      setPlaylists([]);
      setPlaylistError(error.message);
    }
    setLoadingPlaylists(false);
  };

  const openPlaylists = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (status === "loading") {
      toast("Loading your account…");
      return;
    }
    if (status !== "authenticated") {
      closeMenu();
      toast.error("Log in to add songs to a playlist.");
      router.push(loginPath(window.location.href, window.location.origin));
      return;
    }
    if (!scope.isCurrent()) return;
    setView("playlists");
    void loadPlaylists();
  };

  const addToPlaylist = playlist => addition.add(playlist, track);

  const runItemAction = async (event, action) => {
    event.preventDefault(); event.stopPropagation();
    if (!scope.isCurrent()) return;
    try {
      await action();
      if (scope.isCurrent()) closeMenu();
    } catch (error) {
      if (scope.isCurrent()) toast.error(error?.message || "Could not update this item.");
    }
  };

  const actionClass = "flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-[var(--navy-panel)] focus:bg-[var(--navy-panel)] focus:outline-none";

  const menu = open && typeof document !== "undefined" ? createPortal(
    <div
      ref={menuRef}
      data-track-actions-portal="true"
      role="menu"
      aria-label={`Actions for ${track.title || "track"}`}
      style={{ position: "fixed", top: position.top, left: position.left, width: MENU_WIDTH }}
      className="z-[9999] max-h-[min(360px,calc(100vh-16px))] overflow-y-auto rounded-lg border border-[var(--hairline-cyan)] bg-[var(--navy-raised)] p-1.5 text-left text-sm text-white shadow-2xl"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="break-words px-3 py-2 text-xs font-semibold text-gray-400">{track.title || track.name || "Track"}</p>
      {view === "actions" ? <>
        {onRemove && <button type="button" role="menuitem" className={`${actionClass} text-red-300`} onClick={event => void runItemAction(event, onRemove)}>{removeLabel}</button>}
        {onMoveUp && <button type="button" role="menuitem" className={actionClass} onClick={event => void runItemAction(event, onMoveUp)}><ArrowUp size="1em" aria-hidden="true" /><span>Move up</span></button>}
        {onMoveDown && <button type="button" role="menuitem" className={actionClass} onClick={event => void runItemAction(event, onMoveDown)}><ArrowDown size="1em" aria-hidden="true" /><span>Move down</span></button>}
        <button type="button" role="menuitem" disabled={unavailable} title={unavailable ? "This song is unavailable" : undefined} onClick={playNext} className={`${actionClass} disabled:cursor-not-allowed disabled:opacity-40`}>
          <FiPlayCircle size="1em" aria-hidden="true" className="text-[var(--accent)]" />
          <span className="flex-1">Play next</span>
        </button>
        <button type="button" role="menuitem" disabled={unavailable} title={unavailable ? "This song is unavailable" : undefined} onClick={add} className={`${actionClass} disabled:cursor-not-allowed disabled:opacity-40`}>
          <BiAddToQueue size="1em" aria-hidden="true" className="text-[var(--accent)]" />
          <span className="flex-1">Add to queue</span>
        </button>
        <button type="button" role="menuitem" onClick={openPlaylists} className={actionClass}>
          <FiPlus size="1em" aria-hidden="true" className="text-[var(--accent)]" />
          <span className="flex-1">Add to playlist</span>
          <FiChevronRight size="1em" aria-hidden="true" className="opacity-45" />
        </button>
      </> : <>
        <button type="button" role="menuitem" onClick={() => setView("actions")} className={actionClass}>
          <FiChevronLeft size="1em" aria-hidden="true" />
          <span className="flex-1">Add to playlist</span>
        </button>
        <div className="border-t border-[var(--hairline)] pt-1">
          {loadingPlaylists && <p className="px-3 py-3 text-xs text-[var(--muted)]">Loading playlists…</p>}
          {!loadingPlaylists && playlistError && <div className="px-3 py-2">
            <p className="text-xs text-[var(--muted)]">{playlistError}</p>
            <button type="button" onClick={() => void loadPlaylists()} className="mt-2 text-xs font-semibold text-[var(--accent)]">Try again</button>
          </div>}
          {!loadingPlaylists && !playlistError && playlists?.length === 0 && <p className="px-3 py-3 text-xs text-[var(--muted)]">No playlists yet.</p>}
          {!loadingPlaylists && !playlistError && <button type="button" role="menuitem" disabled={Boolean(addingPlaylistId)} className={actionClass}
            onClick={() => { closeMenu(); setCreating(true); }}><FiPlus size="1em" aria-hidden="true" /><span>Create playlist</span></button>}
          {!loadingPlaylists && !playlistError && playlists?.length > 0 && <div className="max-h-56 overflow-y-auto overscroll-contain py-1">
            {playlists.map((playlist) => <button
              key={playlist._id}
              type="button"
              role="menuitem"
              disabled={Boolean(addingPlaylistId)}
              onClick={() => void addToPlaylist(playlist)}
              className="block min-h-10 w-full truncate rounded-md px-3 py-2 text-left hover:bg-[var(--navy-panel)] disabled:opacity-50"
            >
              {addingPlaylistId === playlist._id ? "Adding…" : playlist.name || "Untitled playlist"}
            </button>)}
          </div>}
        </div>
      </>}
    </div>,
    document.body,
  ) : null;

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex shrink-0 ${className}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={buttonRef}
        data-item-menu-trigger
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (open) closeMenu();
          else {
            setView("actions");
            setOpen(true);
          }
        }}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-gray-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <FiMoreHorizontal size="1em" aria-hidden="true" />
      </button>
      {menu}
      <PlaylistDuplicateDialog addition={addition} />
      <PlaylistModal show={creating} setShow={setCreating} navigateOnCreate={false}
        onCreated={playlist => {
          if (!scope.isCurrent()) return;
          setPlaylists(current => [playlist, ...(current || [])]);
          void addToPlaylist(playlist);
        }} />
    </span>
  );
}

