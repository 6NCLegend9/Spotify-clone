"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import MediaImage from "@/components/MediaImage";
import { requestJson } from "@/services/http";
import { useNav } from "../Layout/AppShell";

const Following = () => {
  const { setShowNav } = useNav();
  const { status } = useSession();
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);

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
      try {
        const json = await requestJson("/api/followedArtists", {
          signal: controller.signal,
          fallbackTitle: "Following unavailable",
          fallbackMessage: "We couldn’t load the artists you follow.",
        });
        if (!active) return;
        const meta = Array.isArray(json?.artists) ? json.artists : [];
        const names = Array.isArray(json?.data) ? json.data : [];
        // Merge legacy name-only follows (no channelId) with enriched metadata.
        const merged = names.map((name) => {
          const match = meta.find((item) => (item?.name || "").toLowerCase() === name.toLowerCase());
          return {
            name,
            channelId: match?.channelId || "",
            thumbnail: match?.thumbnail || "",
          };
        });
        setArtists(merged);
      } catch {
        if (active) setArtists([]);
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

  if (status !== "authenticated") return null;

  const hrefFor = (artist) =>
    artist.channelId
      ? `/artist/${encodeURIComponent(artist.channelId)}?name=${encodeURIComponent(artist.name)}`
      : `/search/${encodeURIComponent(artist.name)}`;

  return (
    <div>
      <p className="px-2 py-2 text-sm font-semibold text-white">Following</p>
      <div className="flex max-h-52 flex-col overflow-y-auto">
        {loading ? (
          <p className="px-2 py-3 text-xs text-[#9aa8b5]">Loading artists…</p>
        ) : artists.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[#9aa8b5]">
            Follow an artist to see them here.
          </p>
        ) : (
          artists.map((artist) => (
            <Link
              key={`${artist.name}-${artist.channelId}`}
              href={hrefFor(artist)}
              onClick={() => setShowNav(false)}
              className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-200 transition hover:bg-white/5"
            >
              <MediaImage
                src={artist.thumbnail}
                size="mq"
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
              <span className="truncate">{artist.name}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default Following;
