"use client";

import { useEffect, useRef, useState } from "react";
import { Heart as FiHeart } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { togglePlaylistLike } from "@/services/playlistApi";
import { toUserError } from "@/utils/userError";
import { loginPath } from "@/utils/appOrigin.mjs";
import useAccountScope from "@/hooks/useAccountScope";
import { notifyPlaylistChanged } from "@/utils/playlistEvents.mjs";

export default function LikePlaylistButton(props) {
  const scope = useAccountScope();
  return <AccountLikePlaylistButton key={`${scope.key}:${props.playlist?._id}`} {...props} />;
}

function AccountLikePlaylistButton({ playlist, onChange, className = "" }) {
  const scope = useAccountScope();
  const { status } = scope;
  const router = useRouter();
  const inFlight = useRef(false);
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
    if (!scope.isCurrentView() || status === "loading") return;
    if (status !== "authenticated") {
      toast.error("Log in to like playlists.");
      router.push(loginPath(window.location.href, window.location.origin));
      return;
    }
    if (inFlight.current || !playlist?._id || !scope.isCurrent()) return;
    const previousLiked = liked;
    const previousCount = count;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((value) => Math.max(0, value + (nextLiked ? 1 : -1)));
    setPending(true);
    inFlight.current = true;
    let response;
    try {
      response = await togglePlaylistLike(playlist._id, nextLiked);
    } catch (error) {
      response = error;
    }
    if (!scope.isCurrent()) return;
    inFlight.current = false;
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
    notifyPlaylistChanged({ owner: scope.owner, playlist: { ...playlist, ...nextData } });
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
      title={liked ? "Remove from Your Library" : "Save to Your Library"}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-semibold transition duration-200 ease-out hover:bg-white/10 active:scale-[0.98] ${
        liked ? "text-[var(--accent)]" : "text-gray-300 hover:text-white"
      } ${className}`}
    >
      <FiHeart size="1em" className={liked ? "fill-current" : ""} />
      <span>{count.toLocaleString()}</span>
    </button>
  );
}
