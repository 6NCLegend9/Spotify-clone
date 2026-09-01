"use client";

import { useState } from "react";
import { FiHeart } from "react-icons/fi";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { togglePlaylistLike } from "@/services/playlistApi";
import { humanizeError } from "@/utils/authErrors";

export default function LikePlaylistButton({ playlist, onChange, className = "" }) {
  const { status } = useSession();
  const [liked, setLiked] = useState(Boolean(playlist?.liked));
  const [count, setCount] = useState(Number(playlist?.likesCount) || 0);
  const [pending, setPending] = useState(false);

  const toggle = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (status !== "authenticated") {
      toast.error("Log in to like playlists.");
      return;
    }
    if (pending || !playlist?._id) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((value) => Math.max(0, value + (nextLiked ? 1 : -1)));
    setPending(true);
    const response = await togglePlaylistLike(playlist._id);
    setPending(false);
    if (!response?.success) {
      setLiked(!nextLiked);
      setCount((value) => Math.max(0, value + (nextLiked ? -1 : 1)));
      toast.error(humanizeError(response?.message).message);
      return;
    }
    setLiked(Boolean(response.data?.liked));
    setCount(Number(response.data?.likesCount) || 0);
    onChange?.(response.data);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? "Unlike playlist" : "Like playlist"}
      title={liked ? "Unlike" : "Like"}
      className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold transition duration-200 ease-out hover:bg-white/10 active:scale-[0.98] ${
        liked ? "text-[#00e6e6]" : "text-gray-300 hover:text-white"
      } ${className}`}
    >
      <FiHeart className={liked ? "fill-current" : ""} />
      <span>{count.toLocaleString()}</span>
    </button>
  );
}
