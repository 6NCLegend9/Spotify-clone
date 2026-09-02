"use client";

import EmptyState from "@/components/EmptyState";

export default function ArtistPage() {
  const focusSearch = () => {
    const searchInput = document.querySelector('input[name="search-field"]');
    searchInput?.focus();
    searchInput?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="page text-gray-200">
      <EmptyState
        eyebrow="Legacy artist link"
        title="This artist page is unavailable"
        message="This older catalog link is no longer supported. Search for the artist to find their playable songs."
        actionLabel="Search music"
        onAction={focusSearch}
        secondaryHref="/"
        secondaryLabel="Back to Home"
      />
    </div>
  );
}
