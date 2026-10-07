import React from "react";
import { cleanTitle } from "@/utils/text";
import FxEq from "@/components/FxEq";
import ArtistNameLink from "@/components/ArtistNameLink";

const Track = ({ isPlaying, isActive, activeSong, fullScreen }) => {
  return (
    <div
      className={`flex-1 flex items-center justify-start ${
        fullScreen ? "hidden" : ""
      }`}
    >
      <div
        className={`fx-vinyl ${
          isPlaying && isActive ? "is-spinning" : ""
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
        <p className="flex items-center truncate text-white font-bold text-lg">
          {isPlaying && isActive ? <FxEq className="mr-2" /> : null}
          {cleanTitle(activeSong?.name || activeSong?.title, "Song")}
        </p>
        <ArtistNameLink track={activeSong} className="text-gray-300" />
      </div>
    </div>
  );
};

export default Track;
