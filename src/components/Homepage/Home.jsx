"use client";

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { setProgress } from "@/redux/features/loadingBarSlice";
import { GiMusicalNotes } from "react-icons/gi";
import OnlineStatus from "./OnlineStatus";
import { useSession } from "next-auth/react";
import RecommendationCard from "../RecommendationCard";
import RecommendationPlaylistCard from "../RecommendationPlaylistCard";

const Home = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const dispatch = useDispatch();
  const { status } = useSession();

  const currentHour = new Date().getHours();
  let salutation = "Good evening";
  if (currentHour >= 5 && currentHour < 12) salutation = "Good morning";
  else if (currentHour >= 12 && currentHour < 18) salutation = "Good afternoon";

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      dispatch(setProgress(70));
      const response = await fetch("/api/recommendations");
      const res = response.ok ? await response.json() : null;
      setData(res || null);
      dispatch(setProgress(100));
      setLoading(false);
    };
    fetchData();
  }, [status]);

  const sections = data?.sections || {};
  const isPersonalized = data?.mode === "personalized";
  const sectionList = [
    [isPersonalized ? "Made For You" : "Featured Editorial", sections.trending],
    [isPersonalized ? "Top Trends For You" : "Trending Now", sections.charts],
    [isPersonalized ? "Discover Something New" : "New Releases", sections.newReleases],
    ["Featured Playlists", sections.featuredPlaylists],
  ];

  const handleDismiss = (id) => {
    setData((current) => {
      if (!current?.sections) return current;
      const stripped = Object.fromEntries(
        Object.entries(current.sections).map(([key, videos]) => [
          key,
          videos?.filter((video) => video.id !== id),
        ]),
      );
      return { ...current, sections: stripped };
    });
    fetch("/api/notInterested", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  return (
    <div className="page animate-fade-in">
      <OnlineStatus />
      <header className="page-hero">
        <div>
          <p className="eyebrow">Hayasaka Music</p>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-extrabold text-white sm:text-4xl lg:text-5xl">
            {salutation}
            <GiMusicalNotes className="text-[#00e6e6]" />
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[#9aa8b5]">
            Stream, save, and download tracks without leaving the app.
          </p>
        </div>
      </header>

      {loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="card animate-shimmer aspect-video bg-white/5" />
          ))}
        </div>
      )}

      {!loading && sections.trending?.length > 0 && (
        <section className="mb-10">
          <h2 className="section-title">Quick Access</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sections.trending.slice(0, 6).map((video) => (
              <RecommendationCard
                key={`quick-${video.id}`}
                video={video}
                queue={sections.trending}
                onDismiss={status === "authenticated" ? handleDismiss : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {!loading &&
        sectionList.map(
          ([title, videos]) =>
            videos?.length > 0 && (
              <section key={title} className="mb-10">
                <h2 className="section-title">{title}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {videos.map((video) =>
                    title === "Featured Playlists" ? (
                      <RecommendationPlaylistCard key={video.id} playlist={video} />
                    ) : (
                      <RecommendationCard
                        key={video.id}
                        video={video}
                        queue={videos}
                        onDismiss={status === "authenticated" ? handleDismiss : undefined}
                      />
                    ),
                  )}
                </div>
              </section>
            ),
        )}
    </div>
  );
};

export default Home;
