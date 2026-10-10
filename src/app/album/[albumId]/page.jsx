"use client";

import EmptyState from "@/components/EmptyState";
import { useParams } from "next/navigation";
import ArtistRelease from "@/components/ArtistRelease";

const MUSIC_ALBUM_ID = /^MPR[A-Za-z0-9_-]{3,125}$/;

export default function AlbumPage() {
  const params = useParams();
  const albumId = typeof params?.albumId === "string" ? params.albumId : "";
  const focusSearch = () => {
    const searchInput = document.querySelector('input[name="search-field"]');
    searchInput?.focus();
    searchInput?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (MUSIC_ALBUM_ID.test(albumId)) {
    return <ArtistRelease key={albumId} albumId={albumId} />;
  }

  return (
    <div className="page text-gray-200">
      <EmptyState
        eyebrow="Legacy album link"
        title="This album page is unavailable"
        message="This older catalog link is no longer supported. Search for the album or its songs to find playable results."
        actionLabel="Search music"
        onAction={focusSearch}
        secondaryHref="/"
        secondaryLabel="Back to Home"
      />
    </div>
  );
}
