"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import RecommendationCard from "../RecommendationCard";
import { requestJson } from "@/services/http";

export default function FollowedReleases() {
  const { status } = useSession();
  const [releases, setReleases] = useState([]);

  useEffect(() => {
    if (status !== "authenticated") {
      setReleases([]);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      try {
        const json = await requestJson("/api/followedArtists/releases", {
          signal: controller.signal,
          fallbackTitle: "New releases unavailable",
          fallbackMessage: "We couldn’t load new songs from artists you follow.",
        });
        if (!active) return;
        const list = Array.isArray(json?.releases) ? json.releases : [];
        setReleases(
          list.map((track) => ({
            ...track,
            reason: `New drop from ${track.channel} — check it out`,
          })),
        );
      } catch {
        if (active) setReleases([]);
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [status]);

  if (status !== "authenticated" || releases.length === 0) return null;

  return (
    <section className="mb-10 animate-fade-in">
      <h2 className="section-title">New from artists you follow</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {releases.map((video) => (
          <RecommendationCard key={video.id} video={video} queue={releases} />
        ))}
      </div>
    </section>
  );
}
