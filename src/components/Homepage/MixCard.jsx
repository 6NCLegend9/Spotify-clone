"use client";

import { useState } from "react";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { toast } from "react-hot-toast";
import Image from "next/image";
import { BsPlayFill } from "react-icons/bs";
import logo from "@/assets/HayKasa-logo-removebg.png";
import { requestJson } from "@/services/http";
import { mixBackground } from "@/utils/homeMixes";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import { collectionPlayback, discoveryPlaylistHref } from "@/utils/discoveryPlaylist.mjs";
import { toUserError } from "@/utils/userError";

export default function MixCard({ mix }) {
  const dispatch = useDispatch();
  const [busy, setBusy] = useState(false);
  const palette = mix.palette || {};

  const playMix = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let tracks = mix.tracks;
      if (!tracks?.length) {
        const data = await requestJson(mix.playlistId
          ? `/api/youtube-playlist?id=${encodeURIComponent(mix.playlistId)}`
          : `/api/youtube-search?type=video&q=${encodeURIComponent(mix.query || mix.title)}`, {
          fallbackTitle: "Playlist unavailable",
          fallbackMessage: "We couldn’t load this playlist. Please try again.",
        });
        tracks = mix.playlistId ? data?.tracks : data?.results;
      }
      const playback = collectionPlayback(mix, tracks);
      if (!playback) return toast.error("This playlist has no playable tracks right now.");
      dispatch(startYoutubePlayback(playback));
    } catch (error) {
      toast.error(toUserError(error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="home-mix group w-full text-left"
      style={{ background: mixBackground(palette) }}
    >
      <Link href={discoveryPlaylistHref(mix)} aria-label={`Open playlist ${mix.title}`} className="absolute inset-0 z-[3] rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" />
      <span className="home-mix-pattern" aria-hidden="true" />
      {mix.stamp ? (
        <span className="home-mix-stamp" aria-hidden="true">
          {String(mix.stamp).split(/\s+/).map((word) => (
            <span key={word}>{word}</span>
          ))}
        </span>
      ) : null}
      <span className="absolute left-2.5 top-2.5 z-[2] h-6 w-6 overflow-hidden sm:h-7 sm:w-7">
        <Image src={logo} alt="" className="h-6 w-6 object-contain sm:h-7 sm:w-7" />
      </span>
      <span className="home-mix-title !right-16">
        <span className="home-mix-bar" style={{ background: palette.bar || "#00e6e6" }} />
        <span className="line-clamp-2">{mix.title}</span>
      </span>
      <button type="button" onClick={playMix} disabled={busy} aria-label={`Play ${mix.title}`} className="home-square-play !z-[4] !opacity-100 disabled:opacity-50">
        <BsPlayFill aria-hidden="true" className="text-xl" />
      </button>
    </div>
  );
}

