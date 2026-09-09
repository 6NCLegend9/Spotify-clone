"use client";

import { useMemo, useState } from "react";
import HomeHeader from "./HomeHeader";
import QuickAccessGrid from "./QuickAccessGrid";
import FeaturedRelease from "./FeaturedRelease";
import { MixRail, TrackRail } from "./HomeRail";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { HomeFeedSkeleton } from "@/components/Skeleton";
import useHomeFeed from "@/hooks/useHomeFeed";
import { buildCategoryMixes, buildMoodMixes, soundtrackHeading } from "@/utils/homeMixes";

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.id || item?.playlist?._id || item?.type;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const Home = () => {
  const [filter, setFilter] = useState("all");
  const {
    status,
    loading,
    refreshing,
    error,
    retry,
    isPersonalized,
    history,
    playlists,
    releases,
    trending,
    charts,
    newReleases,
    featuredPlaylists,
    genreSections,
    hasAny,
  } = useHomeFeed();

  const soundtrackTitle = useMemo(() => soundtrackHeading(), []);
  const moodMixes = useMemo(() => buildMoodMixes(), []);
  const categoryMixes = useMemo(() => buildCategoryMixes(), []);

  const featured = releases[0] || newReleases[0] || trending[0] || null;
  const featuredQueue = releases.length ? releases : newReleases.length ? newReleases : trending;
  const followRail = releases.filter((track) => track.id !== featured?.id);

  const quickItems = useMemo(() => {
    const items = [];
    if (status === "authenticated") {
      items.push({ type: "liked", id: "liked" });
    }
    playlists.forEach((playlist) => {
      items.push({ type: "playlist", id: `pl-${playlist._id}`, playlist });
    });
    history.forEach((song, index) => {
      items.push({
        ...song,
        type: "track",
        title: song.title || song.name,
        queue: history,
        queueIndex: index,
      });
    });
    trending.forEach((video, index) => {
      items.push({
        ...video,
        type: "track",
        source: "youtube",
        queue: trending,
        queueIndex: index,
      });
    });
    return uniqueById(items).slice(0, 12);
  }, [history, playlists, status, trending]);

  const playlistMixes = (featuredPlaylists || []).slice(0, 8).map((playlist) => ({
    id: `ytpl-${playlist.id}`,
    title: playlist.title,
    playlistId: playlist.id,
    query: playlist.title,
    kind: "playlist",
    palette: {
      from: "#07121d",
      via: "#0b4a6b",
      to: "#00e6e6",
      bar: "#00e6e6",
    },
    stamp: "FEATURED",
  }));

  return (
    <div className="page-home">
      <div className="home-wash" aria-hidden="true" />
      <HomeHeader filter={filter} onFilter={setFilter} />

      {filter === "podcasts" ? (
        <EmptyState
          eyebrow="Podcasts"
          title="Podcasts aren’t here yet"
          message="HeyKasa is built for music right now. Switch back to All or Music to keep listening."
          actionLabel="Show all"
          onAction={() => setFilter("all")}
        />
      ) : (
        <div key={filter} className="fx-stack">
          {loading && <HomeFeedSkeleton />}

          {!loading && error && !hasAny && (
            <UserMessage
              title={error.title}
              message={error.message}
              onRetry={retry}
              busy={refreshing}
            />
          )}

          {!loading && error && hasAny && (
            <div className="mb-6">
              <UserMessage
                tone="warning"
                title={error.title}
                message={error.message}
                onRetry={retry}
                busy={refreshing}
                compact
              />
            </div>
          )}

          {!loading && <QuickAccessGrid items={quickItems} />}

          {!loading && featured && (
            <FeaturedRelease video={featured} queue={featuredQueue} />
          )}

          {!loading && <MixRail title={soundtrackTitle} mixes={moodMixes} />}

          {!loading && (
            <TrackRail
              title="Jump back in"
              videos={history.map((song) => ({
                ...song,
                title: song.title || song.name,
                channel: song.channel || (Array.isArray(song.artists?.primary)
                  ? song.artists.primary.map((artist) => artist?.name).filter(Boolean).join(", ")
                  : ""),
              }))}
            />
          )}

          {!loading && followRail.length > 0 && (
            <TrackRail title="New from artists you follow" videos={followRail} />
          )}

          {!loading && (
            <TrackRail
              title={isPersonalized ? "Made For You" : "Featured Editorial"}
              videos={trending.filter((video) => video.id !== featured?.id)}
            />
          )}

          {!loading && (
            <TrackRail
              title={isPersonalized ? "Top Trends For You" : "Trending Now"}
              videos={charts}
            />
          )}

          {!loading && (
            <MixRail
              title={isPersonalized ? "Mixes for you" : "Made for you"}
              mixes={categoryMixes}
            />
          )}

          {!loading && <MixRail title="Featured Playlists" mixes={playlistMixes} />}

          {!loading &&
            genreSections.map((section) => (
              <TrackRail
                key={section.title}
                title={section.title}
                videos={section.videos}
              />
            ))}

          {!loading && !error && !hasAny && quickItems.length === 0 && (
            <EmptyState
              eyebrow="Home"
              title="No recommendations yet"
              message="Try another refresh while we look for music for you."
              actionLabel="Refresh recommendations"
              onAction={retry}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Home;
