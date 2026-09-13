"use client";

import { useEffect, useState } from "react";
import { FiHeart } from "react-icons/fi";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { togglePlaylistLike } from "@/services/playlistApi";
import { toUserError } from "@/utils/userError";
import { loginPath } from "@/utils/appOrigin.mjs";

export default function LikePlaylistButton({ playlist, onChange, className = "" }) {
  const { status } = useSession();
  const router = useRouter();
  const [liked, setLiked] = useState(Boolean(playlist?.liked));
  const [count, setCount] = useState(Number(playlist?.likesCount) || 0);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLiked(Boolean(playlist?.liked));
    setCount(Math.max(0, Number(playlist?.likesCount) || 0));
  }, [playlist?.liked, playlist?.likesCount]);

  const toggle = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (status !== "authenticated") {
      toast.error("Log in to like playlists.");
      router.push(loginPath(window.location.href, window.location.origin));
      return;
    }
    if (pending || !playlist?._id) return;
    const previousLiked = liked;
    const previousCount = count;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((value) => Math.max(0, value + (nextLiked ? 1 : -1)));
    setPending(true);
    const response = await togglePlaylistLike(playlist._id, nextLiked);
    setPending(false);
    if (!response?.success) {
      setLiked(previousLiked);
      setCount(previousCount);
      const normalized = toUserError(response);
      toast.error((normalized.code === "UNAUTHORIZED"
        ? normalized
        : toUserError(response, {
          title: "Like not updated",
          message: "We couldn’t update that playlist like. Please try again.",
        })).message);
      return;
    }
    const nextData = response.data && typeof response.data === "object"
      ? response.data
      : { liked: nextLiked, likesCount: previousCount + (nextLiked ? 1 : -1) };
    setLiked(Boolean(nextData.liked));
    setCount(Math.max(0, Number(nextData.likesCount) || 0));
    onChange?.(nextData);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-busy={pending}
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
