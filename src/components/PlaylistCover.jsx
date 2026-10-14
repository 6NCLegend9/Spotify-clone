"use client";

import { useState } from "react";

import {
  FiActivity,
  FiHeart,
  FiMusic,
  FiStar,
  FiZap,
  FiMonitor,
  FiHeadphones,
  FiTarget,
} from "react-icons/fi";
import { getPlaylistTheme } from "@/utils/playlistThemes";

const ICONS = {
  sports: FiTarget,
  workout: FiActivity,
  chill: FiMusic,
  party: FiZap,
  romance: FiHeart,
  gaming: FiMonitor,
  hiphop: FiHeadphones,
  pop: FiStar,
  rock: FiMusic,
};

export default function PlaylistCover({ playlist, className = "", showLabel = false }) {
  const [failed, setFailed] = useState("");
  const custom = playlist?.coverImage;
  const trackCover = playlist?.cover;
  if (custom && custom !== failed) {
    return <img src={custom} onError={() => setFailed(custom)} alt="" className={`aspect-square w-full object-cover ${className}`} />;
  }
  if (trackCover && trackCover !== failed) {
    return (
      <img
        src={trackCover}
        onError={() => setFailed(trackCover)}
        alt=""
        loading="lazy"
        decoding="async"
        className={`aspect-square w-full object-cover ${className}`}
      />
    );
  }

  const theme = getPlaylistTheme(playlist?.category);
  const Icon = ICONS[theme.icon] || FiMusic;
  return (
    <div
      className={`grid aspect-square w-full place-items-center bg-gradient-to-br ${theme.gradient} text-white ${className}`}
    >
      <div className="flex flex-col items-center gap-2 px-3 text-center">
        <Icon className="h-12 w-12 drop-shadow sm:h-14 sm:w-14" />
        {showLabel ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">
            {theme.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}
