"use client";

import { useState } from "react";
import { FaPlus } from "react-icons/fa";
import { toast } from "react-hot-toast";
import { createPlaylist } from "@/services/playlistApi";
import { useDispatch } from "react-redux";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import CoverUploader from "@/components/CoverUploader";
import UserMessage from "@/components/UserMessage";
import AccessibleDialog from "@/components/AccessibleDialog";
import { PLAYLIST_CATEGORIES, inferPlaylistCategory } from "@/utils/playlistThemes";
import { toUserError } from "@/utils/userError";
import { useSession } from "next-auth/react";

const PlaylistModal = ({ show, setShow, onCreated }) => {
  const dispatch = useDispatch();
  const { status } = useSession();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Pop");
  const [coverImage, setCoverImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const handelCreate = async () => {
    if (loading) return;
    if (status !== "authenticated") {
      setFormError(toUserError({ code: "UNAUTHORIZED" }));
      return;
    }
    if (!name.trim()) {
      setFormError({ title: "Name required", message: "Give your playlist a name." });
      return;
    }
    setLoading(true);
    setFormError(null);
    const res = await createPlaylist(name.trim(), { category, coverImage });
    if (res?.success === true) {
      toast.success("Playlist created");
      setName("");
      setCategory("Pop");
      setCoverImage("");
      setShow(false);
      onCreated?.(res.data?.playlist);
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
      panelClassName="auth-card max-h-[90vh] overflow-y-auto animate-fade-in"
    >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="create-playlist-title" className="text-lg font-semibold text-white">Create playlist</h2>
          <button
            type="button"
            onClick={() => setShow(false)}
            disabled={loading}
            className="icon-btn h-9 w-9"
            aria-label="Close"
          >
            ×
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
          <>
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
            setCategory(inferPlaylistCategory(next, category));
          }}
          value={name}
          name="name"
          type="text"
          placeholder="Playlist name"
          className="field"
        />
        <p id="playlist-type-label" className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">Type</p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="playlist-type-label">
          {PLAYLIST_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className={`rounded-full border px-3 py-1.5 text-xs transition duration-200 ease-out active:scale-[0.98] ${
                category === item
                  ? "border-[#00e6e6] bg-[#00e6e6]/10 text-[#00e6e6]"
                  : "border-white/15 text-gray-300 hover:border-white/30"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-5">
          <CoverUploader value={coverImage} onChange={setCoverImage} disabled={loading} />
        </div>
        <button
          type="button"
          onClick={handelCreate}
          disabled={loading}
          aria-busy={loading}
          className="btn-primary mt-5 w-full"
        >
          {loading ? <span className="custom-loader" aria-hidden="true" /> : <FaPlus aria-hidden="true" />}
          {loading ? "Creating…" : "Create"}
        </button>
          </>
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
