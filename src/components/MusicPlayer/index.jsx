"use client";
import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  nextSong,
  prevSong,
  playPause,
  setFullScreen,
} from "../../redux/features/playerSlice";
import Controls from "./Controls";
import Player from "./Player";
import Seekbar from "./Seekbar";
import Track from "./Track";
import VolumeBar from "./VolumeBar";
import PlayerVolume from "./PlayerVolume";
import FullscreenTrack from "./FullscreenTrack";
import Lyrics from "./Lyrics";
import Downloader from "./Downloader";
import { HiOutlineChevronDown } from "react-icons/hi";
import { addFavourite, getFavourite } from "@/services/dataAPI";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import FavouriteButton from "./FavouriteButton";
import UserMessage from "@/components/UserMessage";
import YouTubePlayer from "./YouTubePlayer";
import PictureInPictureWindow, { PIP_DOCUMENT_STYLES } from "./PictureInPictureWindow";
import useSyncedLyrics from "@/hooks/useSyncedLyrics";
import { MdPictureInPictureAlt } from "react-icons/md";
import { toUserError } from "@/utils/userError";

function getAverageImageColor(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;

        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] < 128) continue;
          red += pixels[index];
          green += pixels[index + 1];
          blue += pixels[index + 2];
          count += 1;
        }

        if (!count) throw new Error("Image has no visible pixels.");
        resolve({
          red: Math.round(red / count),
          green: Math.round(green / count),
          blue: Math.round(blue / count),
        });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Album artwork could not be loaded."));
    image.src = src;
  });
}

const MusicPlayer = () => {
  const {
    activeSong,
    currentSongs,
    currentIndex,
    isActive,
    isPlaying,
    fullScreen,
    youtubeVideo,
  } = useSelector((state) => state.player);
  const { isTyping } = useSelector((state) => state.loadingBar);
  const {
    pictureInPicture,
    dataSaver,
    audioOnly: audioOnlyToggle,
    videoQuality,
  } = useSelector((state) => state.settings);
  const audioOnly = audioOnlyToggle || videoQuality === "audio-only";
  const compactPlayback = audioOnly || dataSaver;
  const [duration, setDuration] = useState(0);
  const [seekTime, setSeekTime] = useState(0);
  const [appTime, setAppTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [favouriteSongs, setFavouriteSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [favouriteFeedback, setFavouriteFeedback] = useState(null);
  const dispatch = useDispatch();
  const { status } = useSession();
  const router = useRouter();
  const [bgColor, setBgColor] = useState();
  const pipWindowRef = useRef(null);
  const pipMountRef = useRef(null);
  const [pipWindow, setPipWindow] = useState(null);
  const nativeTitle = activeSong?.name || activeSong?.title || "";
  const nativeArtist = Array.isArray(activeSong?.artists?.primary)
    ? activeSong.artists.primary.map((item) => item?.name).filter(Boolean).join(", ")
    : typeof activeSong?.artists === "string"
    ? activeSong.artists
    : activeSong?.primaryArtists || "";
  const nativeLyrics = useSyncedLyrics({
    title: nativeTitle,
    artist: nativeArtist,
    duration,
    enabled: Boolean(nativeTitle) && !youtubeVideo,
  });

  const songCount = Array.isArray(currentSongs) ? currentSongs.length : 0;
  useEffect(() => {
    if (songCount && activeSong?.id) dispatch(playPause(true));
  }, [activeSong?.id, currentIndex, dispatch, songCount]);

  useEffect(() => {
    let cancelled = false;
    const fetchFavourites = async () => {
      if (status !== "authenticated") {
        setFavouriteSongs([]);
        return;
      }
      try {
        setLoading(true);
        const res = await getFavourite();
        if (!cancelled && res) {
          setFavouriteSongs(res);
        }
      } catch (error) {
        // The player remains usable if favourites cannot be synchronized.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchFavourites();

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    setFavouriteFeedback(null);
  }, [activeSong?.id]);

  useEffect(() => {
    let cancelled = false;
    const src = activeSong?.image?.[1]?.url;

    if (src) {
      getAverageImageColor(src)
        .then((color) => {
          if (!cancelled) setBgColor(color);
        })
        .catch(() => {
          if (!cancelled) setBgColor(undefined);
        });
    } else {
      setBgColor(undefined);
    }

    if (activeSong?.name) {
      document.title = activeSong?.name;
    }

    return () => {
      cancelled = true;
    };
  }, [activeSong]);

  // off scroll when full screen
  useEffect(() => {
    document.documentElement.style.overflow = fullScreen ? "hidden" : "";

    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [fullScreen]);

  useEffect(() => {
    const handleKeyPress = (event) => {
      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const isActionControl =
        target instanceof HTMLElement &&
        Boolean(
          target.closest(
            "button, a, [role='button'], [role='link'], [role='menuitem'], [role='option'], [role='tab'], [role='switch'], summary",
          ),
        );
      if (
        !isTyping &&
        !isEditable &&
        !isActionControl &&
        isActive &&
        (event.code === "Space" || event.key === " ")
      ) {
        event.preventDefault();
        dispatch(playPause(!isPlaying));
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [dispatch, isActive, isPlaying, isTyping]);

  const closeNativePip = () => {
    try {
      pipWindowRef.current?.close?.();
    } catch (error) {
      // already closed
    }
    pipWindowRef.current = null;
    pipMountRef.current = null;
    setPipWindow(null);
  };

  const toggleNativePip = async (event) => {
    event?.stopPropagation();
    if (pictureInPicture === false) return;
    if (pipWindowRef.current) {
      closeNativePip();
      return;
    }
    if (!window.documentPictureInPicture?.requestWindow) return;
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 390, height: 280 });
      const style = pip.document.createElement("style");
      style.textContent = PIP_DOCUMENT_STYLES;
      pip.document.head.appendChild(style);
      const mount = pip.document.createElement("div");
      mount.id = "HeyKasa-pip";
      mount.style.height = "100%";
      pip.document.body.appendChild(mount);
      pip.addEventListener("pagehide", () => {
        pipWindowRef.current = null;
        pipMountRef.current = null;
        setPipWindow(null);
      });
      pipWindowRef.current = pip;
      pipMountRef.current = mount;
      setPipWindow(pip);
    } catch (error) {
      // User dismissed the PiP prompt or the browser blocked it.
    }
  };

  useEffect(() => () => {
    try {
      pipWindowRef.current?.close?.();
    } catch (error) {
      // already closed
    }
  }, []);

  const handlePlayPause = (e) => {
    e?.stopPropagation();
    if (!isActive || (!activeSong?.id && !youtubeVideo?.id)) return;

    if (isPlaying) {
      dispatch(playPause(false));
    } else {
      dispatch(playPause(true));
    }
  };

  const handleNextSong = (e) => {
    e?.stopPropagation();
    if (!songCount) return;
    const safeIndex = Number.isInteger(currentIndex) && currentIndex >= 0
      ? currentIndex
      : 0;

    if (!shuffle) {
      dispatch(nextSong((safeIndex + 1) % songCount));
    } else {
      dispatch(nextSong(Math.floor(Math.random() * songCount)));
    }
  };

  const handlePrevSong = (e) => {
    e?.stopPropagation();
    if (!songCount) return;
    const safeIndex = Number.isInteger(currentIndex) && currentIndex >= 0
      ? currentIndex
      : 0;
    if (safeIndex === 0) {
      dispatch(prevSong(songCount - 1));
    } else if (shuffle) {
      dispatch(prevSong(Math.floor(Math.random() * songCount)));
    } else {
      dispatch(prevSong(safeIndex - 1));
    }
  };

  const handleAddToFavourite = async (favsong) => {
    if (!favsong?.id || loading) return;

    if (status === "loading") {
      setFavouriteFeedback({
        tone: "info",
        title: "Checking your account",
        message: "Please wait a moment, then try again.",
      });
      return;
    }

    if (status !== "authenticated") {
      setFavouriteFeedback({
        tone: "info",
        title: "Log in to save tracks",
        message: "Log in to add this track to your Liked Songs.",
        href: "/login",
      });
      dispatch(setFullScreen(false));
      router.push("/login");
      return;
    }

    const previousSongs = Array.isArray(favouriteSongs) ? favouriteSongs : [];
    const wasFavourite = previousSongs.includes(favsong.id);
    const optimisticSongs = wasFavourite
      ? previousSongs.filter((songId) => songId !== favsong.id)
      : [...previousSongs, favsong.id];

    setLoading(true);
    setFavouriteFeedback(null);
    setFavouriteSongs(optimisticSongs);

    try {
      const res = await addFavourite({ id: favsong.id });
      if (!res?.success) {
        setFavouriteSongs(previousSongs);
        setFavouriteFeedback({
          tone: "error",
          title: res?.title || "Liked Songs not updated",
          message: res?.message || "We couldn’t update your Liked Songs. Please try again.",
          retryable: res?.retryable !== false,
        });
        window.dispatchEvent(new CustomEvent("favourites-changed", { detail: previousSongs }));
        return;
      }

      const nextSongs = Array.isArray(res?.data?.favourites)
        ? res.data.favourites
        : optimisticSongs;
      setFavouriteSongs(nextSongs);
      setFavouriteFeedback({
        tone: "success",
        title: wasFavourite ? "Removed from Liked Songs" : "Added to Liked Songs",
      });
      window.dispatchEvent(new CustomEvent("favourites-changed", { detail: nextSongs }));
    } catch (error) {
      const userError = toUserError(error, {
        title: "Liked Songs not updated",
        message: "We couldn’t update your Liked Songs. Please try again.",
      });
      setFavouriteSongs(previousSongs);
      setFavouriteFeedback({
        tone: "error",
        title: userError.title,
        message: userError.message,
        retryable: userError.retryable,
      });
      window.dispatchEvent(new CustomEvent("favourites-changed", { detail: previousSongs }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (compactPlayback) dispatch(setFullScreen(false));
  }, [compactPlayback, dispatch]);

  if (!activeSong?.id && !youtubeVideo?.id) return null;

    return (
    <div
      className={`player-dock hideScrollBar flex flex-col ${
        fullScreen && !compactPlayback
          ? `player-dock--full items-stretch ${youtubeVideo ? "p-0 overflow-hidden" : "items-center min-[1180px]:items-stretch"}`
          : `items-center min-[1180px]:items-stretch ${youtubeVideo ? "w-full" : "h-20 w-full px-4 sm:px-8"}`
      }`}
      role="region"
      aria-label="Now playing"
      onClick={() => {
        if (!youtubeVideo && activeSong?.id && !compactPlayback) {
          dispatch(setFullScreen(!fullScreen));
        }
      }}
      style={{
        backgroundColor: bgColor
          ? `rgba(${bgColor.red}, ${bgColor.green}, ${bgColor.blue}, 0.22)`
          : undefined,
      }}
    >
        <YouTubePlayer />
        {!youtubeVideo && (
        <button
          type="button"
          aria-label={fullScreen ? "Minimize player" : "Expand player"}
          title={fullScreen ? "Minimize player" : "Expand player"}
          onClick={(e) => {
            e.stopPropagation();
            if (compactPlayback) return;
            dispatch(setFullScreen(!fullScreen));
          }}
          disabled={compactPlayback}
          className={`absolute z-10 grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10 ${
            fullScreen ? "top-16 right-7 hidden md:grid md:top-10" : "right-2 top-2"
          }`}
        >
          <HiOutlineChevronDown
            aria-hidden="true"
            className={`text-2xl ${fullScreen ? "" : "rotate-180"}`}
          />
        </button>
        )}
      {!youtubeVideo && <div
        className={`flex flex-col max-md:justify-center max-md:items-center ${
          fullScreen && !compactPlayback ? "max-md:min-h-screen pb-5" : ""
        }`}
      >
        <FullscreenTrack
          handleNextSong={handleNextSong}
          handlePrevSong={handlePrevSong}
          activeSong={activeSong}
          fullScreen={fullScreen}
          currentTime={appTime}
          duration={duration}
          onSeek={setSeekTime}
        />
        <div className=" flex items-center justify-between pt-2 max-w-[1300px]">
          <Track
            isPlaying={isPlaying}
            isActive={isActive}
            activeSong={activeSong}
            fullScreen={fullScreen}
          />
          <div className="flex-1 flex flex-col items-center justify-center">
            <div
              className={`${
                fullScreen ? "" : "hidden"
              }  sm:hidden flex items-center justify-center gap-4`}
            >
              <FavouriteButton
                favouriteSongs={favouriteSongs}
                activeSong={activeSong}
                loading={loading}
                handleAddToFavourite={handleAddToFavourite}
                style={"mb-4"}
              />
              <div
                className={`mb-3 sm:hidden flex items-center justify-center`}
              >
                <Downloader activeSong={activeSong} fullScreen={fullScreen} />
              </div>
            </div>
            <Controls
              isPlaying={isPlaying}
              isActive={isActive}
              repeat={repeat}
              setRepeat={setRepeat}
              shuffle={shuffle}
              setShuffle={setShuffle}
              currentSongs={currentSongs}
              activeSong={activeSong}
              fullScreen={fullScreen}
              handlePlayPause={handlePlayPause}
              handlePrevSong={handlePrevSong}
              handleNextSong={handleNextSong}
              handleAddToFavourite={handleAddToFavourite}
              favouriteSongs={favouriteSongs}
              loading={loading}
            />
            <Seekbar
              value={appTime}
              min="0"
              max={duration}
              fullScreen={fullScreen}
              onInput={(event) => setSeekTime(event.target.value)}
              setSeekTime={setSeekTime}
              appTime={appTime}
            />
            <Player
              activeSong={activeSong}
              volume={volume}
              isPlaying={isPlaying}
              seekTime={seekTime}
              repeat={repeat}
              currentIndex={currentIndex}
              onEnded={handleNextSong}
              handlePlayPause={handlePlayPause}
              handleNextSong={handleNextSong}
              handlePrevSong={handlePrevSong}
              onTimeUpdate={(event) => setAppTime(event.target.currentTime)}
              onLoadedData={(event) => setDuration(event.target.duration)}
              appTime={appTime}
              setSeekTime={setSeekTime}
            />
            {favouriteFeedback ? (
              <div
                className="mt-2 w-full max-w-md"
                onClick={(event) => event.stopPropagation()}
              >
                <UserMessage
                  tone={favouriteFeedback.tone}
                  title={favouriteFeedback.title}
                  message={favouriteFeedback.message}
                  href={favouriteFeedback.href}
                  hrefLabel="Log in"
                  onRetry={
                    favouriteFeedback.retryable
                      ? () => handleAddToFavourite(activeSong)
                      : undefined
                  }
                  busy={loading}
                  compact
                />
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={Boolean(pipWindow)}
              aria-label={pipWindow ? "Exit picture in picture" : "Picture in picture"}
              title={pictureInPicture === false ? "Picture-in-picture is turned off in Settings" : "Picture in picture"}
              disabled={pictureInPicture === false}
              onClick={toggleNativePip}
              className={`hidden rounded-full p-2 hover:bg-white/10 md:grid ${pipWindow ? "text-[#00e6e6]" : "text-gray-300"}`}
            >
              <MdPictureInPictureAlt size={18} />
            </button>
            <PlayerVolume />
            <VolumeBar
            activeSong={activeSong}
            bgColor={bgColor}
            fullScreen={fullScreen}
            value={volume}
            min="0"
            max="1"
            onChange={(event) => setVolume(event.target.value)}
            setVolume={setVolume}
          />
          </div>
        </div>
      </div>}

      {fullScreen && !compactPlayback && !youtubeVideo && (
        <div className=" min-[1180px]:hidden">
          <Lyrics
            activeSong={activeSong}
            currentSongs={currentSongs}
            currentTime={appTime}
            duration={duration}
            onSeek={setSeekTime}
          />
        </div>
      )}
      {pipWindow && pipMountRef.current && !youtubeVideo && (
        <PictureInPictureWindow
          container={pipMountRef.current}
          video={{
            title: nativeTitle,
            channel: nativeArtist,
            thumbnail: activeSong?.image?.[2]?.url || activeSong?.image?.[1]?.url || activeSong?.image?.[0]?.url || "",
          }}
          currentTime={appTime}
          duration={duration}
          isPlaying={isPlaying}
          lines={nativeLyrics.lines}
          onPlayPause={handlePlayPause}
          onSeekBy={(amount) => setSeekTime(Math.max(0, appTime + amount))}
          onNext={handleNextSong}
          onClose={closeNativePip}
        />
      )}
    </div>
  );
};

export default MusicPlayer;
