"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiHeart } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { addFavourite, getFavourite } from "@/services/dataAPI";
import { toUserError } from "@/utils/userError";
import { accountOwner } from "@/utils/accountCache.mjs";

let cachedFavouriteIds = null;
let favouriteRequest = null;
let cachedUserId = null;
let cacheRevision = 0;

function loadFavourites(userId) {
  if (cachedUserId !== userId) {
    cacheRevision += 1;
    cachedUserId = userId;
    cachedFavouriteIds = null;
    favouriteRequest = null;
  }
  if (!favouriteRequest) {
    const revision = cacheRevision;
    favouriteRequest = getFavourite()
      .then((ids) => {
        if (revision !== cacheRevision || cachedUserId !== userId) return null;
        cachedFavouriteIds = Array.isArray(ids) ? ids : [];
        return cachedFavouriteIds;
      })
      .catch((error) => {
        if (revision !== cacheRevision || cachedUserId !== userId) return null;
        cachedFavouriteIds = [];
        favouriteRequest = null;
        toast.error(toUserError(error, {
          title: "Liked Songs unavailable",
          message: "We couldn’t load your Liked Songs. Please try again.",
        }).message, { id: "favourites-load-error" });
        return cachedFavouriteIds;
      });
  }
  return favouriteRequest;
}

export default function FavouriteTrackButton({ track, className = "" }) {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  return <AccountFavouriteButton key={owner || status} owner={owner} status={status} track={track} className={className} />;
}

function AccountFavouriteButton({ owner, status, track, className }) {
  const router = useRouter();
  const [favouriteIds, setFavouriteIds] = useState(() => cachedUserId === owner ? cachedFavouriteIds || [] : []);
  const [saving, setSaving] = useState(false);
  const live = useRef(true);
  const isSaved = favouriteIds.includes(track?.id);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !owner) {
      setFavouriteIds([]);
      return;
    }

    let active = true;
    loadFavourites(owner).then((ids) => {
      if (active && ids) setFavouriteIds(ids);
    });
    const syncFavourites = (event) => {
      if (event.accountOwner && event.accountOwner !== owner || cachedUserId !== owner) return;
      cacheRevision += 1;
      cachedFavouriteIds = Array.isArray(event.detail) ? event.detail : [];
      favouriteRequest = Promise.resolve(cachedFavouriteIds);
      setFavouriteIds(cachedFavouriteIds);
    };
    window.addEventListener("favourites-changed", syncFavourites);
    return () => {
      active = false;
      window.removeEventListener("favourites-changed", syncFavourites);
    };
  }, [owner, status]);

  const toggleFavourite = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (status === "loading") {
      toast("Checking your account…", { id: "favourites-session-check" });
      return;
    }
    if (status !== "authenticated") {
      toast.error("Log in to save tracks to your Liked Songs.", {
        id: "favourites-login-required",
      });
      router.push("/login");
      return;
    }
    if (!track?.id || saving) return;

    setSaving(true);
    const optimisticIds = isSaved
      ? favouriteIds.filter((id) => id !== track.id)
      : [...favouriteIds, track.id];
    setFavouriteIds(optimisticIds);

    try {
      const response = await addFavourite({ id: track.id, liked: !isSaved });
      if (!live.current || cachedUserId !== owner) return;
      if (!response?.success) {
        throw toUserError(response, {
          title: "Liked Songs not updated",
          message: "We couldn’t update your Liked Songs. Please try again.",
        });
      }
      cacheRevision += 1;
      favouriteRequest = null;
      const nextIds = await loadFavourites(owner);
      if (!live.current || cachedUserId !== owner || !nextIds) return;
      window.dispatchEvent(Object.assign(new CustomEvent("favourites-changed", { detail: nextIds }), { accountOwner: owner }));
      toast.success(isSaved ? "Removed from Liked Songs" : "Added to Liked Songs");
    } catch (error) {
      if (!live.current || cachedUserId !== owner) return;
      setFavouriteIds(cachedFavouriteIds || []);
      const userError = toUserError(error, {
        title: "Liked Songs not updated",
        message: "We couldn’t update your Liked Songs. Please try again.",
      });
      toast.error(userError.message);
      if (userError.action === "login") router.push("/login");
    } finally {
      if (live.current) setSaving(false);
    }
  };

  return (
    <button
      type="button"
      aria-label={isSaved ? "Remove from Liked Songs" : "Save to Liked Songs"}
      title={isSaved ? "Remove from Liked Songs" : "Save to Liked Songs"}
      disabled={saving || !track?.id}
      aria-busy={saving}
      onClick={toggleFavourite}
      className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition hover:bg-white/10 disabled:opacity-50 ${
        isSaved ? "text-[#00e6e6]" : "text-gray-300"
      } ${className}`}
    >
      <FiHeart className={isSaved ? "fill-current" : ""} />
    </button>
  );
}