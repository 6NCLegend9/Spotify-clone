"use client";

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { setProgress } from "@/redux/features/loadingBarSlice";
import { GiMusicalNotes } from "react-icons/gi";
import OnlineStatus from "./OnlineStatus";
import { useSession } from "next-auth/react";
import RecommendationCard from "../RecommendationCard";
import RecommendationPlaylistCard from "../RecommendationPlaylistCard";
import ListenAgain from "./ListenAgain";
import GradientText from "@/components/ReactBits/GradientText";

const HOME_CACHE_KEY = "HeyKasa-home-recommendations";

const readHomeCache = (status) => {
  try {
    const raw = sessionStorage.getItem(`${HOME_CACHE_KEY}:${status}`);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const writeHomeCache = (status, value) => {
  try {
    sessionStorage.setItem(`${HOME_CACHE_KEY}:${status}`, JSON.stringify(value));
  } catch (error) {
    // Storage may be unavailable.
  }
};

const Home = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const dispatch = useDispatch();
  const { status } = useSession();

  const [salutation, setSalutation] = useState("Welcome");

  useEffect(() => {
    const currentHour = new Date().getHours();
    if (currentHour >= 5 && currentHour < 12) setSalutation("Good morning");
    else if (currentHour >= 12 && currentHour < 18) setSalutation("Good afternoon");
    else setSalutation("Good evening");
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    const controller = new AbortController();
    let cancelled = false;
    const cached = readHomeCache(status);
    if (cached) {
      setData(cached);
      setLoading(false);
    }
    const fetchData = async () => {
      if (!cached) {
        setLoading(true);
        dispatch(setProgress(70));
      }
      try {
        const response = await fetch("/api/recommendations", {
          signal: controller.signal,
        });
        const res = response.ok ? await response.json() : null;
        if (cancelled) return;
        if (res?.sections) {
          setData(res);
          writeHomeCache(status, res);
        } else if (!cached) {
          setData(null);
        }
      } catch (error) {
        if (!cancelled && error.name !== "AbortError" && !cached) {
          setData(null);
        }
      } finally {
        if (!cancelled) {
          dispatch(setProgress(100));
          setLoading(false);
        }
      }
    };
    fetchData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dispatch, status]);

  const sections = data?.sections || {};
  const isPersonalized = data?.mode === "personalized";
  const genreSections = Array.isArray(sections.genres) ? sections.genres : [];
  const sectionList = [
    [isPersonalized ? "Made For You" : "Featured Editorial", sections.trending],
    [isPersonalized ? "Top Trends For You" : "Trending Now", sections.charts],
    [isPersonalized ? "Discover Something New" : "New Releases", sections.newReleases],
    ["Featured Playlists", sections.featuredPlaylists],
    ...genreSections.map((section) => [section.title, section.videos]),
  ];

  return (
    <div className="page animate-fade-in relative z-10">
      <OnlineStatus />
      <header className="page-hero">
        <div>
          <p className="eyebrow">HeyKasa Music</p>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-extrabold sm:text-4xl lg:text-5xl">
            <GradientText
              colors={["#00e6e6", "#ffffff", "#008080", "#00e6e6"]}
              animationSpeed={4}
            >
              {salutation}
            </GradientText>
            <GiMusicalNotes className="text-[#00e6e6]" />
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[#9aa8b5]">
            Stream, save, and download tracks without leaving the app.
          </p>
        </div>
      </header>

      <ListenAgain />

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
              />
            ))}
          </div>
        </section>
      )}

      {!loading && !sectionList.some(([, videos]) => videos?.length > 0) && (
        <p className="mt-6 text-sm text-gray-400">Recommendations are loading slowly. Open Home again in a moment.</p>
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
