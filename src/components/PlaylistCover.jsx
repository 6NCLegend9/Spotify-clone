"use client";

import { useState } from "react";

import {
  Activity as FiActivity,
  Heart as FiHeart,
  Music as FiMusic,
  Star as FiStar,
  Zap as FiZap,
  Monitor as FiMonitor,
  Headphones as FiHeadphones,
  Target as FiTarget,
} from "lucide-react";
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
      <div className="flex w-full min-w-0 flex-col items-center gap-2 text-center">
        <Icon className="h-auto w-1/2 max-w-12 drop-shadow sm:max-w-14" />
        {showLabel ? (
          <span className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/90">
            {theme.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}
