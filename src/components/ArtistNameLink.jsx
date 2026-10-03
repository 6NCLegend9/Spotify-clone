"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,24}$/;

export function artistPageHref(channelId, name) {
  const id = typeof channelId === "string" ? channelId.trim() : "";
  if (!CHANNEL_ID_PATTERN.test(id)) return "";
  const artist = typeof name === "string" ? name.trim() : "";
  return artist
    ? `/artist/${encodeURIComponent(id)}?name=${encodeURIComponent(artist)}`
    : `/artist/${encodeURIComponent(id)}`;
}

export default function ArtistNameLink({ channelId, name, className = "" }) {
  const router = useRouter();
  const label = typeof name === "string" ? name.trim() : "";
  if (!label) return null;
  const href = artistPageHref(channelId, label);
  if (!href) return <span className={className}>{label}</span>;
  return (
    <Link
      href={href}
      prefetch={false}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        router.push(href);
      }}
    >
      {label}
    </Link>
  );
}
