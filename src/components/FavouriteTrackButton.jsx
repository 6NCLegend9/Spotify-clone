"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiHeart } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { addFavourite, getFavourite } from "@/services/dataAPI";
import { toUserError } from "@/utils/userError";

let cachedFavouriteIds = null;
let favouriteRequest = null;
let cachedUserId = null;

function loadFavourites(userId) {
  if (cachedUserId !== userId) {
    cachedUserId = userId;
    cachedFavouriteIds = null;
    favouriteRequest = null;
  }
  if (!favouriteRequest) {
    favouriteRequest = getFavourite()
      .then((ids) => {
        cachedFavouriteIds = Array.isArray(ids) ? ids : [];
        return cachedFavouriteIds;
      })
      .catch((error) => {
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
  const router = useRouter();
  const [favouriteIds, setFavouriteIds] = useState(cachedFavouriteIds || []);
  const [saving, setSaving] = useState(false);
  const isSaved = favouriteIds.includes(track?.id);

  useEffect(() => {
    if (status !== "authenticated") {
      setFavouriteIds([]);
      return;
    }

    let active = true;
    const userId = session?.user?.id || session?.user?.email;
    loadFavourites(userId).then((ids) => {
      if (active) setFavouriteIds(ids);
    });
    const syncFavourites = (event) => {
      cachedFavouriteIds = event.detail || [];
      favouriteRequest = Promise.resolve(cachedFavouriteIds);
      setFavouriteIds(cachedFavouriteIds);
    };
    window.addEventListener("favourites-changed", syncFavourites);
    return () => {
      active = false;
      window.removeEventListener("favourites-changed", syncFavourites);
    };
  }, [session?.user?.email, session?.user?.id, status]);

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
    const previousIds = favouriteIds;
    cachedFavouriteIds = optimisticIds;
    favouriteRequest = Promise.resolve(optimisticIds);
    setFavouriteIds(optimisticIds);
    window.dispatchEvent(new CustomEvent("favourites-changed", { detail: optimisticIds }));

    try {
      const response = await addFavourite({ id: track.id });
      if (!response?.success) {
        const userError = toUserError(response, {
          title: "Liked Songs not updated",
          message: "We couldn’t update your Liked Songs. Please try again.",
        });
        cachedFavouriteIds = previousIds;
        favouriteRequest = Promise.resolve(previousIds);
        setFavouriteIds(previousIds);
        window.dispatchEvent(new CustomEvent("favourites-changed", { detail: previousIds }));
        toast.error(userError.message);
        if (userError.action === "login") router.push("/login");
        return;
      }
      const nextIds = Array.isArray(response.data?.favourites)
        ? response.data.favourites
        : optimisticIds;
      cachedFavouriteIds = nextIds;
      favouriteRequest = Promise.resolve(nextIds);
      setFavouriteIds(nextIds);
      window.dispatchEvent(new CustomEvent("favourites-changed", { detail: nextIds }));
      toast.success(isSaved ? "Removed from Liked Songs" : "Added to Liked Songs");
    } catch (error) {
      cachedFavouriteIds = previousIds;
      favouriteRequest = Promise.resolve(previousIds);
      setFavouriteIds(previousIds);
      window.dispatchEvent(new CustomEvent("favourites-changed", { detail: previousIds }));
      const userError = toUserError(error, {
        title: "Liked Songs not updated",
        message: "We couldn’t update your Liked Songs. Please try again.",
      });
      toast.error(userError.message);
      if (userError.action === "login") router.push("/login");
    } finally {
      setSaving(false);
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
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition hover:bg-white/10 disabled:opacity-50 ${
        isSaved ? "text-[#00e6e6]" : "text-gray-300"
      } ${className}`}
    >
      <FiHeart className={isSaved ? "fill-current" : ""} />
    </button>
  );
}