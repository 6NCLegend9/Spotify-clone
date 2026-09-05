"use client";

import { useParams, useSearchParams } from "next/navigation";
import ArtistProfile from "@/components/ArtistProfile";
import EmptyState from "@/components/EmptyState";

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,24}$/;

export default function ArtistPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const artistId = typeof params?.artistId === "string" ? params.artistId : "";
  const initialName = searchParams.get("name")?.trim() || "";

  if (!CHANNEL_ID_PATTERN.test(artistId)) {
    return (
      <div className="page text-gray-200">
        <EmptyState
          eyebrow="Artist"
          title="This artist page is unavailable"
          message="Search for the artist to open their songs in HeyKasa."
          href="/"
          actionLabel="Back to Home"
        />
      </div>
    );
  }

  return <ArtistProfile artistId={artistId} initialName={initialName} />;
}
