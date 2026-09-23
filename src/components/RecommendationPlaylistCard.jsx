"use client";

import Link from "next/link";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import toast from "react-hot-toast";
import { BsPlayFill } from "react-icons/bs";
import MediaImage from "@/components/MediaImage";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import ItemMenu from "@/components/ItemMenu";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";
import { discoveryPlaylistHref } from "@/utils/discoveryPlaylist.mjs";

export default function RecommendationPlaylistCard({ playlist }) {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const title = cleanTitle(playlist.title, "Untitled playlist");
  const href = discoveryPlaylistHref({ ...playlist, playlistId: playlist.id });

  const playPlaylist = async () => {
    if (loading || !playlist?.id) return;
    setLoading(true);
    try {
      const data = await requestJson(
        `/api/youtube-playlist?id=${encodeURIComponent(playlist.id)}`,
        {
          fallbackCode: "PLAYBACK_ERROR",
          fallbackTitle: "Playlist unavailable",
          fallbackMessage: "We couldn’t load this playlist. Please try again.",
        },
      );
      const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
      if (tracks.length === 0) {
        toast.error("This playlist has no playable videos.");
        return;
      }
      const seeded = tracks.map((track) => ({
        ...track,
        seedQuery: playlist.title,
        genre: playlist.title,
      }));
      dispatch(startYoutubePlayback({
        queue: seeded,
        track: seeded[0],
        queueMode: "collection",
        autoExtend: false,
        context: {
          type: "playlist",
          id: String(playlist.id),
          name: playlist.title || "Playlist",
        },
      }));
    } catch (error) {
      const userError = toUserError(error, {
        title: "Playlist unavailable",
        message: "We couldn’t load this playlist. Please try again.",
      });
      toast.error(userError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ContextMenuTarget className="card group relative block w-full text-left">
      <Link
        href={href}
        aria-label={`Open playlist ${title}`}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <div className="relative aspect-video overflow-hidden rounded-[4px] bg-black">
          <MediaImage
            src={playlist.thumbnail}
            size="hq"
            alt=""
            className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03] group-active:scale-[0.98]"
          />
        </div>
        <div className="p-3 pr-10">
          <p className="home-shelf-title mt-0">{loading ? "Loading..." : title}</p>
          <p className="home-shelf-subtitle">{cleanTitle(playlist.channel)}</p>
        </div>
      </Link>
      <button
        type="button"
        onClick={playPlaylist}
        disabled={loading}
        aria-label={`Play ${title}`}
        className="play-fab is-on disabled:opacity-50"
      >
        <BsPlayFill aria-hidden="true" />
      </button>
      <div className="absolute bottom-3 right-2 z-[4]">
        <ItemMenu
          label={`Playlist options for ${title}`}
          actions={[
            { label: "Play", onSelect: () => { void playPlaylist(); } },
            { label: "Open playlist", href },
          ]}
        />
      </div>
    </ContextMenuTarget>
  );
}
