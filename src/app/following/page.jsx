"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import MediaImage from "@/components/MediaImage";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";

export default function FollowingPage() {
  const { status } = useSession();
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return undefined;
    }
    if (status !== "authenticated") {
      setArtists([]);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const json = await requestJson("/api/followedArtists", {
          signal: controller.signal,
          fallbackTitle: "Following unavailable",
          fallbackMessage: "We couldn’t load the artists you follow.",
        });
        if (!active) return;
        const meta = Array.isArray(json?.artists) ? json.artists : [];
        const names = Array.isArray(json?.data) ? json.data : [];
        const merged = names.map((name) => {
          const match = meta.find((item) => (item?.name || "").toLowerCase() === name.toLowerCase());
          return {
            name,
            channelId: match?.channelId || "",
            thumbnail: match?.thumbnail || "",
          };
        });
        setArtists(merged);
      } catch (loadError) {
        if (active && !controller.signal.aborted) {
          setError(
            toUserError(loadError, {
              title: "Following unavailable",
              message: "We couldn’t load the artists you follow.",
            }),
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [status]);

  const hrefFor = (artist) =>
    artist.channelId
      ? `/artist/${encodeURIComponent(artist.channelId)}?name=${encodeURIComponent(artist.name)}`
      : `/search/${encodeURIComponent(artist.name)}`;

  return (
    <div className="page text-gray-200">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Your artists</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Following</h1>
          <p className="mt-2 text-sm text-[#9aa8b5]">Artists you follow. Open one to see their songs.</p>
        </div>
      </header>

      {status === "unauthenticated" ? (
        <UserMessage
          title="Please log in"
          message="Log in to see the artists you follow."
          href="/login"
          hrefLabel="Log in"
        />
      ) : loading ? (
        <p className="mt-8 text-sm text-[#9aa8b5]">Loading artists…</p>
      ) : error ? (
        <div className="mt-8">
          <UserMessage title={error.title} message={error.message} />
        </div>
      ) : artists.length === 0 ? (
        <EmptyState
          eyebrow="Following"
          title="You’re not following anyone yet"
          message="Follow an artist from search or their page to see them here."
          href="/"
          actionLabel="Back to Home"
        />
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {artists.map((artist) => (
            <Link
              key={`${artist.name}-${artist.channelId}`}
              href={hrefFor(artist)}
              prefetch={false}
              className="group text-center"
            >
              <MediaImage
                src={artist.thumbnail}
                size="mq"
                alt=""
                className="mx-auto aspect-square w-full rounded-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
              />
              <p className="mt-2 truncate text-sm font-semibold text-white">{artist.name}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
