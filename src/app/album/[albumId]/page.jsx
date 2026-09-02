"use client";

import EmptyState from "@/components/EmptyState";

export default function AlbumPage() {
  const focusSearch = () => {
    const searchInput = document.querySelector('input[name="search-field"]');
    searchInput?.focus();
    searchInput?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

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
