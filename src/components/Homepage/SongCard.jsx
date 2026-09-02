"use client";
import React, { memo, useState } from "react";
import { useDispatch } from "react-redux";
import { FaPauseCircle, FaPlayCircle } from "react-icons/fa";
import {
  playPause,
  setActiveSong,
  setFullScreen,
} from "../../redux/features/playerSlice";
import { getRecommendedSongs, getSongData } from "@/services/dataAPI";
import { useSelector } from "react-redux";
import MediaImage from "@/components/MediaImage";
import UserMessage from "@/components/UserMessage";
import { toUserError } from "@/utils/userError";

const hasValidId = (value) =>
  (typeof value === "string" && value.trim().length > 0) ||
  (typeof value === "number" && Number.isFinite(value));

const SongCard = ({ song, isPlaying, activeSong }) => {
  const [loading, setLoading] = useState(false);
  const [playError, setPlayError] = useState(null);
  const { currentSongs, autoAdd } = useSelector((state) => state.player || {});
  const safeCurrentSongs = Array.isArray(currentSongs)
    ? currentSongs.filter((item) => hasValidId(item?.id))
    : [];

  const dispatch = useDispatch();

  const handlePauseClick = () => {
    if (song?.type === "song") {
      dispatch(playPause(false));
    }
  };

  const handlePlayClick = async () => {
    if (song?.type !== "song" || !hasValidId(song?.id) || loading) return;

    setLoading(true);
    setPlayError(null);
    try {
      const data = await getSongData(song.id);
      const fetchedSong = Array.isArray(data)
        ? data.find((item) => hasValidId(item?.id))
        : data;
      const songData = hasValidId(fetchedSong?.id) ? fetchedSong : song;
      if (!hasValidId(songData?.id)) return;

      const primaryArtistsId =
        songData?.primaryArtistsId ||
        songData?.artists?.primary?.[0]?.id ||
        songData?.id;
      const recommendations = hasValidId(primaryArtistsId)
        ? await getRecommendedSongs(primaryArtistsId, songData.id)
        : [];
      const recommendedSongs = Array.isArray(recommendations) ? recommendations : [];
      // remove duplicate songs in recommendedSongs array and currentSongs array
      const filteredRecommendedSongs = recommendedSongs.filter(
        (recommendedSong) =>
          hasValidId(recommendedSong?.id) &&
          !safeCurrentSongs.some(
            (currentSong) => String(currentSong.id) === String(recommendedSong.id),
          ) &&
          String(recommendedSong.id) !== String(songData.id),
      );
      const existingIndex = safeCurrentSongs.findIndex(
        (item) => String(item.id) === String(songData.id),
      );
      const queue =
        existingIndex >= 0
          ? safeCurrentSongs
          : autoAdd
            ? [...safeCurrentSongs, songData, ...filteredRecommendedSongs]
            : [...safeCurrentSongs, songData];

      dispatch(
        setActiveSong({
          song: songData,
          data: queue,
          i: existingIndex >= 0 ? existingIndex : safeCurrentSongs.length,
        })
      );
      dispatch(setFullScreen(true));
      dispatch(playPause(true));
    } catch (error) {
      setPlayError(
        toUserError(error, {
          fallbackCode: "PLAYBACK_ERROR",
          title: "This track can’t play",
          message: "Try again, or choose another track.",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  const artistDisplay =
    (Array.isArray(song?.artists?.primary) &&
      song.artists.primary.length > 0 &&
      song.artists.primary
        .map((artist) => (typeof artist?.name === "string" ? artist.name : ""))
        .filter(Boolean)
        .join(", ")) ||
    (Array.isArray(song?.artists) &&
      song.artists.length > 0 &&
      song.artists
        .map((artist) => (typeof artist?.name === "string" ? artist.name : ""))
        .filter(Boolean)
        .join(", ")) ||
    (Array.isArray(song?.artists?.all) &&
      song.artists.all.length > 0 &&
      song.artists.all
        .map((artist) => (typeof artist?.name === "string" ? artist.name : ""))
        .filter(Boolean)
        .join(", ")) ||
    (typeof song?.subtitle === "string" ? song.subtitle : "");
  const rawTitle =
    typeof song?.name === "string"
      ? song.name.replaceAll("&#039;", "'").replaceAll("&amp;", "&")
      : song?.title;
  const titleDisplay =
    typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : "Untitled track";
  const isActiveSong =
    hasValidId(activeSong?.id) &&
    hasValidId(song?.id) &&
    String(activeSong.id) === String(song.id);

  return (
    <div
      key={song?.id}
      className="card flex w-[150px] shrink-0 flex-col p-2 sm:w-[180px] lg:w-[205px]"
    >
      <div>
        <div className="relative w-full lg:h-[178px] group">
          {song?.type === "song" ? (
            <div
              className={`absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-2 transition-opacity ${
                isActiveSong
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              }`}
            >
              <button
                type="button"
                onClick={isPlaying && isActiveSong ? handlePauseClick : handlePlayClick}
                disabled={loading || !hasValidId(song?.id)}
                aria-label={
                  loading
                    ? `Loading ${titleDisplay}`
                    : isPlaying && isActiveSong
                      ? `Pause ${titleDisplay}`
                      : `Play ${titleDisplay}`
                }
                className="rounded-full text-gray-200 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00e6e6] disabled:cursor-wait disabled:opacity-70"
              >
                {loading ? (
                  <span className="custom-loader block" aria-hidden="true" />
                ) : isPlaying && isActiveSong ? (
                  <FaPauseCircle aria-hidden="true" size={35} />
                ) : (
                  <FaPlayCircle aria-hidden="true" size={35} />
                )}
              </button>
            </div>
          ) : null}
          <MediaImage
            width={200}
            height={200}
            alt={`${titleDisplay} cover`}
            src={song?.image?.[1]?.url || song?.image?.[1]?.link || song?.image?.[2]?.url || ""}
            className="h-full w-full rounded-lg object-cover"
          />
        </div>

        <div className=" mt-2 lg:mt-4 flex flex-col">
          <p
            className="font-semibold text-xs lg:text-sm text-white truncate w-full"
          >
            {titleDisplay}
          </p>
          <p className="text-[9px] lg:text-xs truncate text-gray-300 mt-1">
            {artistDisplay}
          </p>
        </div>
      </div>
      {playError ? (
        <div className="mt-2">
          <UserMessage
            tone="error"
            title={playError.title}
            message={playError.message}
            onRetry={handlePlayClick}
            busy={loading}
            compact
          />
        </div>
      ) : null}
    </div>
  );
};

export default memo(
  SongCard,
  (prev, next) =>
    prev.song === next.song &&
    prev.activeSong === next.activeSong &&
    prev.isPlaying === next.isPlaying
);
