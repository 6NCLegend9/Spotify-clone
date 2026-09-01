"use client";

import GenreBrowser from "@/components/GenreBrowser";

export default function GenresPage() {
  return (
    <main className="page text-white animate-fade-in">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Discover</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Genres & moods</h1>
          <p className="mt-2 max-w-xl text-sm text-[#9aa8b5]">
            Browse categories, open sub-genres, and jump straight into search.
          </p>
        </div>
      </header>
      <GenreBrowser />
    </main>
  );
}
