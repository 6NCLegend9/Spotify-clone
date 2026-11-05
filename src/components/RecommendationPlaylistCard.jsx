"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import toast from "react-hot-toast";
import { Play as BsPlayFill } from "lucide-react";
import MediaImage from "@/components/MediaImage";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import ItemMenu from "@/components/ItemMenu";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";
import { discoveryPlaylistHref } from "@/utils/discoveryPlaylist.mjs";
import useAccountScope from "@/hooks/useAccountScope";
import usePlaybackRequest from "@/hooks/usePlaybackRequest";

export default function RecommendationPlaylistCard({ playlist }) {
  const scope = useAccountScope();
  return <AccountRecommendationPlaylistCard key={`${scope.key}:${playlist.id}`} playlist={playlist} />;
}

function AccountRecommendationPlaylistCard({ playlist }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const { begin, scope } = usePlaybackRequest();
  const pending = useRef(false);
  const [loading, setLoading] = useState(false);
  const title = cleanTitle(playlist.title, "Untitled playlist");
  const href = discoveryPlaylistHref({ ...playlist, playlistId: playlist.id });

  const playPlaylist = async () => {
    if (pending.current || !playlist?.id) return;
    const current = begin();
    if (!current) return;
    pending.current = true;
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
      if (!current()) return;
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
      if (!current()) return;
      const userError = toUserError(error, {
        title: "Playlist unavailable",
        message: "We couldn’t load this playlist. Please try again.",
      });
      toast.error(userError.message);
    } finally {
      pending.current = false;
      if (scope.isCurrentView()) setLoading(false);
    }
  };

  return (
    <ContextMenuTarget className="card group relative block w-full text-left">
      <div className="relative aspect-video overflow-hidden rounded-[4px] bg-black">
        <Link href={href} aria-label={`Open playlist ${title}`} className="block h-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <MediaImage
            src={playlist.thumbnail}
            size="hq"
            alt=""
            className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03] group-active:scale-[0.98]"
          />
        </Link>
        <button type="button" onClick={playPlaylist} disabled={loading} aria-label={`Play ${title}`} aria-busy={loading} className="play-fab is-on disabled:opacity-50">
          <BsPlayFill size="1em" fill="currentColor" aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-start gap-1 p-3">
        <Link href={href} className="min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <p className="home-shelf-title mt-0">{loading ? "Loading..." : title}</p>
          <p className="home-shelf-subtitle">{cleanTitle(playlist.channel)}</p>
        </Link>
        <ItemMenu
          label={`Playlist options for ${title}`}
          actions={[
            { label: "Play", onSelect: () => { void playPlaylist(); } },
            { label: "Open playlist", onSelect: () => router.push(href) },
          ]}
        />
      </div>
    </ContextMenuTarget>
  );
}
