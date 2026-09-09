import Link from "next/link";
import React from "react";
import { cleanTitle } from "@/utils/text";

const Track = ({ isPlaying, isActive, activeSong, fullScreen }) => {
  const primaryArtists = Array.isArray(activeSong?.artists?.primary)
    ? activeSong.artists.primary
    : Array.isArray(activeSong?.artists)
    ? activeSong.artists
    : [];

  return (
    <div
      className={`flex-1 flex items-center justify-start ${
        fullScreen ? "hidden" : ""
      }`}
    >
      <div
        className={`${
          isPlaying && isActive ? "animate-[spin_15s_linear_infinite]" : ""
        } hidden sm:block h-16 w-16 mr-4`}
      >
        <img
          src={
            activeSong?.image?.[2]?.url ||
            activeSong?.image?.[1]?.url ||
            activeSong?.image?.[0]?.url ||
            "https://avatars.githubusercontent.com/u/143804558?v=4"
          }
          alt="cover art"
          className="h-full w-full rounded-full object-cover"
        />
      </div>
      <div className={`w-[190px] select-none cursor-pointer`}>
        <p className="truncate text-white font-bold text-lg">
          {cleanTitle(activeSong?.name || activeSong?.title, "Song")}
        </p>
        <p className="truncate text-gray-300">
          {primaryArtists.length > 0
            ? primaryArtists
                .map((artist) => cleanTitle(artist?.name))
                .filter(Boolean)
                .join(", ")
            : typeof activeSong?.artists === "string"
            ? cleanTitle(activeSong.artists, "Artist")
            : "Artist"}
        </p>
      </div>
    </div>
  );
};

export default Track;
