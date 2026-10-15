"use client";

import { useState } from "react";
import HomeHeader from "./HomeHeader";
import QuickAccessGrid from "./QuickAccessGrid";
import { MixRail, TrackRail } from "./HomeRail";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { HomeFeedSkeleton } from "@/components/Skeleton";
import useHomeFeed from "@/hooks/useHomeFeed";
import { composeHomePage } from "@/utils/homeDiscovery.mjs";

function playlistMixes(playlists) {
  return playlists.map((playlist) => ({
    ...playlist,
    id: `ytpl-${playlist.id}`,
    playlistId: playlist.id,
    kind: "playlist",
    palette: { from: "#0b1629", via: "#101f36", to: "#1171ba", bar: "#24aae2" },
  }));
}

export default function Home() {
  const [filter, setFilter] = useState("all");
  const feed = useHomeFeed();
  const { status, loading, refreshing, error, retry, basis, hasAny } = feed;
  const content = composeHomePage(feed);
  const personalized = basis === "taste" || basis === "activity";
  return (
    <div className="page-home">
      <div className="home-wash" aria-hidden="true" />
      <HomeHeader filter={filter} onFilter={setFilter} onRefresh={retry} refreshing={refreshing || loading} />
      {filter === "for-you" && status === "unauthenticated" ? (
        <EmptyState eyebrow="Made for you" title="Your music, your way" message="Sign in to get recommendations based on your listening and the artists you follow." actionLabel="Log in" href="/login" />
      ) : (
        <div className="fx-stack">
          <QuickAccessGrid items={content.quickItems} />
          {loading && <HomeFeedSkeleton />}
          {!loading && error && (
            <UserMessage title={error.title} message={error.message} onRetry={retry} busy={refreshing} {...(hasAny ? { tone: "warning", compact: true } : {})} />
          )}
          {!loading && <TrackRail title="Jump back in" seeAllHref="/recently-played" videos={content.history} />}
          {!loading && (content.forYou.tracks.length > 0 || content.forYou.playlists.length > 0) && (
            <section aria-labelledby="home-for-you-title" data-home-section="for-you" className="min-w-0">
              <h2 id="home-for-you-title" className="mb-2 text-2xl font-bold text-white">{personalized ? "Made for you" : "Popular right now"}</h2>
              <p className="mb-5 max-w-3xl text-sm text-[var(--teal)]">
                {basis === "taste" ? "Songs and playlists inspired by your genres and favorite artists." : basis === "activity" ? "Inspired by your recent searches and listening." : "Popular songs and playlists to get you started."}
              </p>
              <TrackRail title={personalized ? "Songs for your taste" : "Songs to start with"} videos={content.forYou.tracks} />
              <MixRail title={personalized ? "Playlists for your taste" : "Popular playlists"} mixes={playlistMixes(content.forYou.playlists)} />
            </section>
          )}
          {!loading && (content.explore.tracks.length > 0 || content.explore.playlists.length > 0) && (
            <section aria-labelledby="home-explore-title" data-home-section="explore" className="min-w-0">
              <h2 id="home-explore-title" className="mb-2 text-2xl font-bold text-white">Explore something new</h2>
              <p className="mb-5 max-w-3xl text-sm text-[var(--teal)]">{personalized ? "Branch out with related styles, different artists, and recent discoveries." : "Find your next sound and start shaping your taste."}</p>
              <TrackRail title="New to you" videos={content.explore.tracks} />
              <MixRail title="Playlists to explore" mixes={playlistMixes(content.explore.playlists)} />
            </section>
          )}
          {!loading && !error && !hasAny && content.quickItems.length === 0 && (
            <EmptyState eyebrow="Home" title="No recommendations yet" message="Try another refresh while we look for music for you." actionLabel="Refresh recommendations" onAction={retry} />
          )}
        </div>
      )}
    </div>
  );
}
