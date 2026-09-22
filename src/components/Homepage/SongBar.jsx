"use client";

import { useState } from "react";
import { useDispatch } from "react-redux";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { FaPlayCircle } from "react-icons/fa";
import MediaImage from "@/components/MediaImage";
import { requestJson } from "@/services/http";
import { playHomeTracks } from "@/utils/playHome";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";

/**
 * In-app playlist row: opens `/youtube-playlist/[id]` and can play the first
 * 100 tracks through the shared playlist API (never external YouTube).
 */
export default function SongBar({ playlist, i }) {
  const dispatch = useDispatch();
  const [busy, setBusy] = useState(false);
  const rawTitle = playlist?.title || playlist?.name;
  const title = cleanTitle(rawTitle, "Untitled playlist");
  const rawCoverSrc =
    playlist?.image?.[1]?.url ||
    playlist?.image?.[1]?.link ||
    playlist?.image?.[2]?.url ||
    playlist?.image?.[2]?.link ||
    playlist?.image?.[0]?.url ||
    playlist?.image?.[0]?.link ||
    playlist?.thumbnail ||
    "";
  const coverSrc = typeof rawCoverSrc === "string" ? rawCoverSrc : "";
  const language = typeof playlist?.language === "string" ? playlist.language : "";
  const playlistId = playlist?.id ? String(playlist.id) : "";
  const href = playlistId
    ? `/youtube-playlist/${encodeURIComponent(playlistId)}?${new URLSearchParams({
        name: title,
      })}`
    : "";

  const playPlaylist = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!playlistId || busy) return;
    setBusy(true);
    try {
      const data = await requestJson(
        `/api/youtube-playlist?id=${encodeURIComponent(playlistId)}`,
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
          seedQuery: title,
          genre: title,
        })),
        0,
        {
          queueMode: "collection",
          autoExtend: false,
          playlistId,
          playlistName: title,
        },
      );
    } catch (error) {
      toast.error(toUserError(error).message);
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div
      className={`group mb-2 flex w-full flex-row items-center rounded-lg bg-opacity-20 p-4 py-2 ${
        playlistId ? "cursor-pointer hover:bg-white/[0.06]" : "opacity-60"
      }`}
    >
      {Number.isInteger(i) ? (
        <span className="mr-3 text-base font-extrabold text-white" aria-hidden="true">
          {i + 1}.
        </span>
      ) : null}
      <div className="flex flex-1 flex-row items-center justify-between">
        <MediaImage
          width={80}
          height={80}
          alt=""
          src={coverSrc}
          className="h-20 w-20 rounded-lg object-cover"
        />
        <div className="mx-3 flex flex-1 flex-col justify-center">
          <p className="w-40 truncate text-base font-semibold text-white lg:text-xl md:w-full">
            {title}
          </p>
          {language ? (
            <p className="mt-1 text-sm capitalize text-gray-300 md:text-base">{language}</p>
          ) : null}
        </div>
      </div>
      {playlistId ? (
        <button
          type="button"
          aria-label={`Play ${title}`}
          disabled={busy}
          onClick={playPlaylist}
          className="rounded-full p-1 text-gray-300 transition hover:text-[#00e6e6] disabled:opacity-50"
        >
          <FaPlayCircle aria-hidden="true" size={35} className="transform transition-all duration-300 ease-in-out group-hover:scale-125" />
        </button>
      ) : (
        <FaPlayCircle aria-hidden="true" size={35} className="text-gray-500" />
      )}
    </div>
  );

  if (!href) {
    return <div aria-label={`${title} is unavailable`}>{body}</div>;
  }

  return (
    <Link href={href} prefetch={false} aria-label={`Open playlist ${title}`}>
      {body}
    </Link>
  );
}
