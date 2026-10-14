"use client";

import { useEffect, useRef, useState } from "react";
import { IoClose } from "react-icons/io5";
import { toast } from "react-hot-toast";
import { createPlaylist } from "@/services/playlistApi";
import { useDispatch } from "react-redux";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import CoverUploader from "@/components/CoverUploader";
import UserMessage from "@/components/UserMessage";
import AccessibleDialog from "@/components/AccessibleDialog";
import { PLAYLIST_CATEGORIES, matchPlaylistCategory } from "@/utils/playlistThemes";
import { toUserError } from "@/utils/userError";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useNav } from "../Layout/AppShell";
import { accountOwner } from "@/utils/accountCache.mjs";

const PlaylistModal = ({ show, setShow, onCreated }) => {
  const dispatch = useDispatch();
  const { data: session, status } = useSession();
  const router = useRouter();
  const { setShowNav } = useNav();
  const owner = accountOwner(session, status);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const live = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [autoFill, setAutoFill] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleCreate = async () => {
    if (pending.current) return;
    if (status !== "authenticated") {
      setFormError(toUserError({ code: "UNAUTHORIZED" }));
      return;
    }
    if (!name.trim()) {
      setFormError({ title: "Name required", message: "Give your playlist a name." });
      return;
    }
    pending.current = true;
    setLoading(true);
    setFormError(null);
    const requestOwner = owner;
    const res = await createPlaylist(name.trim(), { category, coverImage, autoFill });
    pending.current = false;
    if (!live.current) return;
    if (currentOwner.current !== requestOwner) {
      setLoading(false);
      return;
    }
    if (res?.success === true) {
      const songCount = res.data?.playlist?.songs?.length || 0;
      toast.success(autoFill && songCount ? `Playlist created with ${songCount} songs` : "Playlist created");
      setName("");
      setCategory("");
      setAutoFill(false);
      setCoverImage("");
      setShow(false);
      const playlist = res.data?.playlist;
      window.dispatchEvent(new CustomEvent("heykasa:playlists-changed", { detail: { owner: requestOwner, playlist } }));
      onCreated?.(playlist);
      if (playlist?._id) {
        setShowNav(false);
        router.push(`/library/playlist/${encodeURIComponent(playlist._id)}`);
      }
    } else {
      const normalized = toUserError(res);
      setFormError(normalized.code === "UNAUTHORIZED"
        ? normalized
        : toUserError(res, {
          title: "Playlist not created",
          message: "We couldn’t create that playlist. Please try again.",
        }));
    }
    setLoading(false);
  };

  if (!show) return null;

  return (
    <AccessibleDialog
      open={show}
      onClose={() => setShow(false)}
      titleId="create-playlist-title"
      closeLabel="Close create playlist dialog"
      disableClose={loading}
      panelClassName="w-full max-w-lg max-h-[min(90dvh,48rem)] overflow-y-auto rounded-xl bg-[var(--navy-panel)] p-5 shadow-2xl sm:p-6"
    >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="create-playlist-title" className="text-2xl font-bold tracking-tight text-white">Create playlist</h2>
          <button
            type="button"
            onClick={() => setShow(false)}
            disabled={loading}
            className="icon-btn h-11 w-11"
            aria-label="Close"
          >
            <IoClose aria-hidden="true" className="text-xl" />
          </button>
        </div>
        <UserMessage
          tone={status === "loading" ? "info" : "error"}
          title={status === "loading" ? "Checking your account…" : formError?.title}
          message={formError?.message}
          href={formError?.action === "login" ? "/login" : undefined}
          hrefLabel="Log in"
        />
        {status === "authenticated" ? (
          <form onSubmit={(event) => { event.preventDefault(); handleCreate(); }}>
        <label htmlFor="playlist-name" className="mb-2 mt-3 block text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
          Name
        </label>
        <input
          id="playlist-name"
          onFocus={() => dispatch(setIsTyping(true))}
          onBlur={() => dispatch(setIsTyping(false))}
          onChange={(e) => {
            const next = e.target.value;
            setName(next);
            setCategory((current) => matchPlaylistCategory(next) || current);
          }}
          maxLength={80}
          disabled={loading}
          required
          value={name}
          name="name"
          type="text"
          placeholder="Playlist name"
          className="field"
        />
        <div className="mt-5">
          <CoverUploader value={coverImage} onChange={setCoverImage} disabled={loading} />
        </div>
        <details className="mt-5 rounded-lg bg-white/[0.04] p-3">
        <summary className="cursor-pointer text-sm font-semibold text-gray-300">Genre and song suggestions (optional)</summary>
        <p id="playlist-type-label" className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">Type</p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="playlist-type-label">
          {PLAYLIST_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              disabled={loading}
              onClick={() => setCategory(category === item ? "" : item)}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-3 py-1.5 text-xs transition duration-200 ease-out active:scale-[0.98] ${
                category === item
                  ? "border-[var(--accent)] bg-white/10 text-[var(--accent)]"
                  : "border-white/15 text-gray-300 hover:border-white/30"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-3 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={autoFill}
            onChange={(e) => setAutoFill(e.target.checked)}
            disabled={loading}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            Fill with songs for this genre
            <span className="mt-0.5 block text-xs text-[#9aa8b5]">We&apos;ll add a mix of {category || "popular"} tracks you can tweak anytime.</span>
          </span>
        </label>
        </details>
        <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="min-h-12 rounded-full bg-[var(--accent)] px-8 font-bold text-black transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create"}
        </button>
        </div>
          </form>
        ) : status === "unauthenticated" && !formError ? (
          <UserMessage
            title="Please log in"
            message="Log in to create and save playlists."
            href="/login"
            hrefLabel="Log in"
          />
        ) : null}
    </AccessibleDialog>
  );
};

export default PlaylistModal;
