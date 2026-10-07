"use client";

import Link from "next/link";
import { artistPageHref, trackArtistCredits } from "@/utils/artistNavigation.mjs";

export { artistPageHref };

/** @param {{ track?: object | null, channelId?: string, name?: string, className?: string, onNavigate?: () => void }} props */
export default function ArtistNameLink({ track = null, channelId = "", name = "", className = "", onNavigate = undefined }) {
  const artists = trackArtistCredits(track || { channelId, channel: name });
  if (!artists.length) return null;
  return <span className={`artist-links ${className}`}>
    {artists.map((artist, index) => <span key={`${artist.channelId || ""}:${artist.name}`}>
      {index > 0 && <span aria-hidden="true">, </span>}
      <Link href={artistPageHref(artist.channelId, artist.name)} prefetch={false}
        onClick={(event) => {
          event.stopPropagation();
          if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) onNavigate?.();
        }}>{artist.name}</Link>
    </span>)}
  </span>;
}
