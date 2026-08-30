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
import YouTubePlayer from "./YouTubePlayer";
import PictureInPictureWindow, { PIP_DOCUMENT_STYLES } from "./PictureInPictureWindow";
import useSyncedLyrics from "@/hooks/useSyncedLyrics";
import { MdPictureInPictureAlt } from "react-icons/md";

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
  const [duration, setDuration] = useState(0);
  const [seekTime, setSeekTime] = useState(0);
  const [appTime, setAppTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [favouriteSongs, setFavouriteSongs] = useState([]);
  const [loading, setLoading] = useState(false);
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

  const songCount = currentSongs?.length || 0;
  useEffect(() => {
    if (songCount) dispatch(playPause(true));
  }, [currentIndex, dispatch, songCount]);

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
      if (
        !isTyping &&
        !isEditable &&
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
      mount.id = "hayasaka-pip";
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
    if (!isActive) return;

    if (isPlaying) {
      dispatch(playPause(false));
    } else {
      dispatch(playPause(true));
    }
  };

  const handleNextSong = (e) => {
    e?.stopPropagation();
    dispatch(playPause(false));

    if (!shuffle) {
      dispatch(nextSong((currentIndex + 1) % currentSongs.length));
    } else {
      dispatch(nextSong(Math.floor(Math.random() * currentSongs.length)));
    }
  };

  const handlePrevSong = (e) => {
    e?.stopPropagation();
    if (currentIndex === 0) {
      dispatch(prevSong(currentSongs.length - 1));
    } else if (shuffle) {
      dispatch(prevSong(Math.floor(Math.random() * currentSongs.length)));
    } else {
      dispatch(prevSong(currentIndex - 1));
    }
  };

  const handleAddToFavourite = async (favsong) => {
    if (status === "unauthenticated") {
      dispatch(setFullScreen(false));
      router.push("/login");
    }

    if (favsong?.id && status === "authenticated") {
      try {
        setLoading(true);
        // optimistic update
        if (favouriteSongs?.find((song) => song === favsong?.id)) {
          setFavouriteSongs(
            favouriteSongs?.filter((song) => song !== favsong?.id),
          );
        } else {
          setFavouriteSongs([...favouriteSongs, favsong?.id]);
        }
        const res = await addFavourite(favsong);
        if (res?.success === true) {
          setFavouriteSongs(res?.data?.favourites);
        }
        setLoading(false);
      } catch (error) {
        setLoading(false);
        console.log("add to fav error", error);
      }
    }
  };

  if (!activeSong?.id && !youtubeVideo) return null;

  return (
    <div
      className={`player-dock hideScrollBar flex flex-col ${
        fullScreen
          ? `player-dock--full items-stretch ${youtubeVideo ? "p-0 overflow-hidden" : "items-center min-[1180px]:items-stretch"}`
          : `items-center min-[1180px]:items-stretch ${youtubeVideo ? "w-full" : "h-20 w-full px-4 sm:px-8"}`
      }`}
      onClick={() => {
        if (!youtubeVideo && activeSong?.id && !audioOnly && !dataSaver) {
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
        <HiOutlineChevronDown
        onClick={(e) => {
          e.stopPropagation();
          dispatch(setFullScreen(!fullScreen));
        }}
        className={` absolute top-16 md:top-10 right-7 text-white text-3xl cursor-pointer ${
          fullScreen ? "hidden md:block" : "hidden"
        }`}
      />
        )}
      {!youtubeVideo && <div
        className={`flex flex-col max-md:justify-center max-md:items-center ${
          fullScreen ? "max-md:min-h-screen pb-5" : ""
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

      {fullScreen && !youtubeVideo && (
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
