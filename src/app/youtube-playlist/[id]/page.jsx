"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import DiscoveryPlaylist from "@/components/DiscoveryPlaylist";
import { SongRowsSkeleton } from "@/components/Skeleton";

function PlaylistPage() {
  const { id } = useParams();
  const params = useSearchParams();
  return <DiscoveryPlaylist key={id} id={id} title={params.get("title") || "Playlist"}
    thumbnail={params.get("thumbnail") || ""} creator={params.get("creator") || undefined}
    href={`/youtube-playlist/${encodeURIComponent(id)}`} />;
}

export default function YouTubePlaylistPage() {
  return <Suspense fallback={<SongRowsSkeleton />}><PlaylistPage /></Suspense>;
}
