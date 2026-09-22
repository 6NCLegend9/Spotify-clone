"use client";

import { useState } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import Image from "next/image";
import { BsPlayFill } from "react-icons/bs";
import logo from "@/assets/HayKasa-logo-removebg.png";
import { requestJson } from "@/services/http";
import { mixBackground } from "@/utils/homeMixes";
import { playHomeTracks } from "@/utils/playHome";
import { toUserError } from "@/utils/userError";

export default function MixCard({ mix }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const palette = mix.palette || {};
  const playlistHref = mix.playlistId
    ? `/youtube-playlist/${encodeURIComponent(mix.playlistId)}?${new URLSearchParams({
        name: mix.title || "Playlist",
      })}`
    : "";

  const playMix = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      if (mix.tracks?.length) {
        playHomeTracks(dispatch, mix.tracks, 0);
        return;
      }
      if (mix.playlistId) {
        const data = await requestJson(
          `/api/youtube-playlist?id=${encodeURIComponent(mix.playlistId)}`,
          {
            fallbackCode: "PLAYBACK_ERROR",
            fallbackTitle: "Playlist unavailable",
            fallbackMessage: "We couldn’t load this playlist. Please try again.",
          },
        );
        const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
        if (!tracks.length) {
          toast.error("This playlist has no playable videos.");
          return;
        }
        playHomeTracks(
          dispatch,
          tracks.map((track) => ({
            ...track,
            seedQuery: mix.title,
            genre: mix.title,
          })),
          0,
          {
            queueMode: "collection",
            autoExtend: false,
            playlistId: mix.playlistId,
            playlistName: mix.title,
          },
        );
        return;
      }
      const data = await requestJson(
        `/api/youtube-search?type=video&q=${encodeURIComponent(mix.query || mix.title)}`,
        {
          fallbackTitle: "Mix unavailable",
          fallbackMessage: "We couldn’t load this mix. Please try again.",
        },
      );
      const tracks = Array.isArray(data?.results) ? data.results : [];
      if (!tracks.length) {
        toast.error("This mix has no playable tracks right now.");
        return;
      }
      playHomeTracks(
        dispatch,
        tracks.map((track) => ({
          ...track,
          seedQuery: mix.query || mix.title,
          genre: mix.title,
        })),
        0,
      );
    } catch (error) {
      toast.error(toUserError(error).message);
    } finally {
      setBusy(false);
    }
  };

  const face = (
    <>
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
      <span className="home-mix-title">
        <span className="home-mix-bar" style={{ background: palette.bar || "#00e6e6" }} />
        <span className="line-clamp-2">{mix.title}</span>
      </span>
    </>
  );

  if (playlistHref) {
    return (
      <div
        className="home-mix group w-full text-left"
        style={{ background: mixBackground(palette) }}
      >
        {face}
        {/* Rendered after the face so the title and logo layers cannot swallow clicks. */}
        <button
          type="button"
          onClick={() => router.push(playlistHref)}
          aria-label={`Open playlist ${mix.title}`}
          className="absolute inset-0 z-[2]"
        />
        <button
          type="button"
          onClick={playMix}
          disabled={busy}
          aria-label={`Play ${mix.title}`}
          className="home-square-play focus-visible:opacity-100 disabled:opacity-70"
        >
          <BsPlayFill aria-hidden="true" className="text-xl" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={playMix}
      disabled={busy}
      aria-label={`Play ${mix.title}`}
      className="home-mix group w-full text-left disabled:opacity-70"
      style={{ background: mixBackground(palette) }}
    >
      {face}
      <span className="home-square-play max-md:hidden">
        <BsPlayFill aria-hidden="true" className="text-xl" />
      </span>
    </button>
  );
}
