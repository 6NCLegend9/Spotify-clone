"use client";
import React from "react";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
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

  // salutation
  const currentTime = new Date();
  const currentHour = currentTime.getHours();

  let salutation = "";
  if (currentHour >= 5 && currentHour < 12) {
    salutation = "Good morning";
  } else if (currentHour >= 12 && currentHour < 18) {
    salutation = "Good afternoon";
  } else {
    salutation = "Good evening";
  }

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

  return (
    <div className="animate-fade-in pb-8">
      <OnlineStatus />
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mx-2 mt-7 mb-8 lg:m-9 text-white flex gap-2 items-center">
        "{salutation}  <GiMusicalNotes />"
      </h1>

      {loading && <p className="mx-2 text-sm text-gray-400">Curating your music...</p>}
      {!loading && sections.trending?.length > 0 && (
        <section className="my-8">
          <h2 className="mb-4 text-2xl font-semibold text-white">Quick Access</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sections.trending.slice(0, 6).map((video) => (
              <RecommendationCard key={`quick-${video.id}`} video={video} queue={sections.trending} />
            ))}
          </div>
        </section>
      )}
      {!loading && sectionList.map(([title, videos]) => videos?.length > 0 && (
        <section key={title} className="my-8">
          <h2 className="mb-4 text-2xl font-semibold text-white">{title}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {videos.map((video) => (
              title === "Featured Playlists" ? (
                <RecommendationPlaylistCard key={video.id} playlist={video} />
              ) : (
                <RecommendationCard key={video.id} video={video} queue={videos} />
              )
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default Home;
