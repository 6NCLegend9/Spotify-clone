"use client";

import EmptyState from "@/components/EmptyState";

export default function PlaylistPage() {
  const focusSearch = () => {
    const searchInput = document.querySelector('input[name="search-field"]');
    searchInput?.focus();
    searchInput?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="page text-gray-200">
      <EmptyState
        eyebrow="Legacy playlist link"
        title="This playlist page is unavailable"
        message="This older catalog link is no longer supported. Search for songs or explore current recommendations instead."
        actionLabel="Search music"
        onAction={focusSearch}
        secondaryHref="/"
        secondaryLabel="Back to Home"
      />
    </div>
  );
}
