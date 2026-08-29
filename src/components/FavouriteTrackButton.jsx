"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiHeart } from "react-icons/fi";
import { addFavourite, getFavourite } from "@/services/dataAPI";

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
    favouriteRequest = getFavourite().then((ids) => {
      cachedFavouriteIds = Array.isArray(ids) ? ids : [];
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
    event.stopPropagation();
    if (status !== "authenticated") {
      router.push("/login");
      return;
    }
    if (!track?.id || saving) return;

    setSaving(true);
    const optimisticIds = isSaved
      ? favouriteIds.filter((id) => id !== track.id)
      : [...favouriteIds, track.id];
    setFavouriteIds(optimisticIds);
    const response = await addFavourite({ id: track.id });
    const nextIds = response?.success ? response.data.favourites : favouriteIds;
    cachedFavouriteIds = nextIds;
    favouriteRequest = Promise.resolve(nextIds);
    setFavouriteIds(nextIds);
    window.dispatchEvent(new CustomEvent("favourites-changed", { detail: nextIds }));
    setSaving(false);
  };

  return (
    <button
      type="button"
      aria-label={isSaved ? "Remove from Liked Songs" : "Save to Liked Songs"}
      title={isSaved ? "Remove from Liked Songs" : "Save to Liked Songs"}
      disabled={saving}
      onClick={toggleFavourite}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition hover:bg-white/10 disabled:opacity-50 ${
        isSaved ? "text-[#00e6e6]" : "text-gray-300"
      } ${className}`}
    >
      <FiHeart className={isSaved ? "fill-current" : ""} />
    </button>
  );
}