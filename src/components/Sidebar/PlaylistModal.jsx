"use client";

import { useState } from "react";
import { FaPlus } from "react-icons/fa";
import { toast } from "react-hot-toast";
import { createPlaylist } from "@/services/playlistApi";
import { useDispatch } from "react-redux";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import CoverUploader from "@/components/CoverUploader";
import AuthMessage from "@/components/AuthMessage";
import { PLAYLIST_CATEGORIES, inferPlaylistCategory } from "@/utils/playlistThemes";
import { humanizeError } from "@/utils/authErrors";

const PlaylistModal = ({ show, setShow, onCreated }) => {
  const dispatch = useDispatch();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Pop");
  const [coverImage, setCoverImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const handelCreate = async () => {
    if (!name.trim()) {
      setFormError({ title: "Name required", message: "Give your playlist a name." });
      return;
    }
    setLoading(true);
    setFormError(null);
    const res = await createPlaylist(name.trim(), { category, coverImage });
    if (res?.success == true) {
      toast.success(res.message || "Playlist created");
      setName("");
      setCategory("Pop");
      setCoverImage("");
      setShow(false);
      onCreated?.(res.data?.playlist);
    } else {
      setFormError({
        title: "Couldn't create playlist",
        message: humanizeError(res).message,
      });
    }
    setLoading(false);
  };

  if (!show) return null;

  return (
    <div
      onClick={() => setShow(false)}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="auth-card max-h-[90vh] overflow-y-auto animate-fade-in"
      >
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">Create playlist</h1>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="icon-btn h-9 w-9"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <AuthMessage
          title={formError?.title}
          message={formError?.message}
          onRetry={() => setFormError(null)}
        />
        <label className="mb-2 mt-3 block text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
          Name
        </label>
        <input
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
        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">Type</p>
        <div className="flex flex-wrap gap-2">
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
          className="btn-primary mt-5 w-full"
        >
          {loading ? <span className="custom-loader" /> : <FaPlus />}
          Create
        </button>
      </div>
    </div>
  );
};

export default PlaylistModal;
