"use client";

import { useState } from "react";
import { FaPlus } from "react-icons/fa";
import { toast } from "react-hot-toast";
import { createPlaylist } from "@/services/playlistApi";
import { useDispatch } from "react-redux";
import { setIsTyping } from "@/redux/features/loadingBarSlice";

const PlaylistModal = ({ show, setShow, onCreated }) => {
  const dispatch = useDispatch();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handelCreate = async () => {
    if (name === "") {
      toast.error("Playlist name is required");
      return;
    }
    setLoading(true);
    const res = await createPlaylist(name);
    if (res.success == true) {
      toast.success(res.message);
      setName("");
      setShow(false);
      onCreated?.(res.data?.playlist);
    } else {
      toast.error(res.message);
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
        className="auth-card"
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
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">
          Name
        </label>
        <input
          onFocus={() => dispatch(setIsTyping(true))}
          onBlur={() => dispatch(setIsTyping(false))}
          onChange={(e) => setName(e.target.value)}
          value={name}
          name="name"
          type="text"
          placeholder="Playlist name"
          className="field"
        />
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
