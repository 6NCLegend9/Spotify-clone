"use client";

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { setProgress } from "@/redux/features/loadingBarSlice";
import { GiMusicalNotes } from "react-icons/gi";
import { useSession } from "next-auth/react";
import RecommendationCard from "../RecommendationCard";
import RecommendationPlaylistCard from "../RecommendationPlaylistCard";
import ListenAgain from "./ListenAgain";
import FollowedReleases from "./FollowedReleases";
import GradientText from "@/components/ReactBits/GradientText";
import { HomeSectionSkeleton } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";

const HOME_CACHE_KEY = "HeyKasa-home-recommendations-v2";

const TAGLINES = [
  "Your Next Favorite Song",
  "Press Play. Feel Alive.",
  "New Music Drops Here",
  "Built for Your Playlist",
  "Discover the Sound You’ll Love",
  "Turn Up Your Day",
  "Fresh Tracks, Every Time",
  "From Vibes to Favorites",
  "Find Your Mood—Fast",
  "Stream the Energy",
  "Loud Vibes Only",
  "New Release, Real Heat",
  "Make Your Playlist Legendary",
  "Skip Less. Enjoy More.",
  "Your Sound, Your World",
  "Let the Music Speak",
  "Stay Tuned for Fresh Beats",
  "Bangers Start Here",
  "Headphones On—Let’s Go",
  "Now Trending in Your Ear",
  "Music Made for Moments",
  "Catch the Rhythm",
  "Go Beyond the Playlist",
  "Feel the Beat Drop",
  "Every Track Hits Different",
  "Your Daily Dose of Music",
  "Curated for Your Ears",
  "Serious Sound Starts Here",
  "Discover • Listen • Repeat",
  "The Soundtrack to Your Life",
  "New Finds, No Filler",
  "Unlock Your Next Obsession",
  "Where Fresh Artists Shine",
  "In Tune with Your Mood",
  "From Underground to Unstoppable",
  "One Click to More Music",
  "Your Next Favorite Genre",
  "Play It Loud",
  "Made for Late Nights",
  "Good Music Never Sleeps",
  "Find the Beat That Fits",
  "Upgrade Your Listening",
  "Tap. Play. Vibe.",
  "Only the Hits",
  "Let’s Build Your Sound",
  "The Heat Is Streaming",
  "Start Listening Now",
  "Fresh Sounds, Straight Up",
  "Press Play on Your Mood",
  "Big Energy. Big Sound."
];

function RandomTagline() {
  const [tagline, setTagline] = useState("Stream, save, and download tracks without leaving the app.");
  useEffect(() => {
    setTagline(TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);
  }, []);
  return <>{tagline}</>;
}

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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
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
      setRefreshing(true);
      setError(null);
      if (!cached) {
        setLoading(true);
        dispatch(setProgress(70));
      }
      try {
        const res = await requestJson("/api/recommendations", {
          signal: controller.signal,
          fallbackTitle: "Home is temporarily unavailable",
          fallbackMessage: "We couldn’t load your recommendations. Please try again.",
        });
        if (cancelled) return;
        if (res?.sections) {
          setData(res);
          writeHomeCache(status, res);
        } else {
          throw toUserError(
            { code: "INTERNAL_ERROR" },
            {
              title: "Home is temporarily unavailable",
              message: "We couldn’t load your recommendations. Please try again.",
            },
          );
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setError(
            toUserError(error, {
              title: "Home is temporarily unavailable",
              message: "We couldn’t load your recommendations. Please try again.",
            }),
          );
          if (!cached) setData(null);
        }
      } finally {
        if (!cancelled) {
          dispatch(setProgress(100));
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dispatch, retryKey, status]);

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
      <header className="page-hero">
        <div>
          <p className="eyebrow">HeyKasa Music</p>
          <h1 className="mt-3 flex items-center gap-2 overflow-visible text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
            <GradientText
              colors={["#00e6e6", "#ffffff", "#008080", "#00e6e6"]}
              animationSpeed={4}
            >
              {salutation}
            </GradientText>
            <GiMusicalNotes className="text-[#00e6e6]" />
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[#9aa8b5]">
            <RandomTagline />
          </p>
        </div>
      </header>

      <ListenAgain />

      <FollowedReleases />

      {!loading && error && data && (
        <div className="mb-8">
          <UserMessage
            tone="warning"
            title={error.title}
            message={error.message}
            onRetry={() => setRetryKey((value) => value + 1)}
            busy={refreshing}
            compact
          />
        </div>
      )}

      {loading && (
        <>
          <HomeSectionSkeleton />
          <HomeSectionSkeleton />
        </>
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

      {!loading && error && !data && (
        <UserMessage
          title={error.title}
          message={error.message}
          onRetry={() => setRetryKey((value) => value + 1)}
          busy={refreshing}
        />
      )}

      {!loading && !error && !sectionList.some(([, videos]) => videos?.length > 0) && (
        <EmptyState
          eyebrow="Home"
          title="No recommendations yet"
          message="Try another refresh while we look for music for you."
          actionLabel="Refresh recommendations"
          onAction={() => setRetryKey((value) => value + 1)}
        />
      )}

      {!loading &&
        sectionList.map(
          ([title, videos]) =>
            videos?.length > 0 && (
              <section key={title} className="mb-10 animate-fade-in">
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
