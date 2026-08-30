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
import getPixels from "get-pixels";
import { extractColors } from "extract-colors";
import YouTubePlayer from "./YouTubePlayer";
import PictureInPictureWindow, { PIP_DOCUMENT_STYLES } from "./PictureInPictureWindow";
import useSyncedLyrics from "@/hooks/useSyncedLyrics";
import { MdPictureInPictureAlt } from "react-icons/md";

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
  const { pictureInPicture } = useSelector((state) => state.settings);
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

  useEffect(() => {
    if (currentSongs?.length) dispatch(playPause(true));
  }, [currentIndex]);

  useEffect(() => {
    const fetchFavourites = async () => {
      try {
        setLoading(true);
        const res = await getFavourite();
        // console.log("favourites",res);
        if (res) {
          setFavouriteSongs(res);
        }
        setLoading(false);
      } catch (error) {
        setLoading(false);
      }
    };
    fetchFavourites();
    // set ambient background
    const src = activeSong?.image?.[1]?.url;

    if (src) {
      getPixels(src, (err, pixels) => {
        if (!err) {
          const data = [...pixels.data];
          const width = Math.round(Math.sqrt(data.length / 4));
          const height = width;

          extractColors({ data, width, height })
            .then((colors) => {
              setBgColor(colors[0]);
            })
            .catch(console.log);
        }
      });
    }
    // change page title to song name
    if (activeSong?.name) {
      document.title = activeSong?.name;
    }
  }, [activeSong]);

  // off scroll when full screen
  useEffect(() => {
    document.documentElement.style.overflow = fullScreen ? "hidden" : "auto";

    return () => {
      document.documentElement.style.overflow = "auto";
    };
  }, [fullScreen]);

  // Hotkey for play pause
  const handleKeyPress = (event) => {
    // Check if the pressed key is the spacebar (keyCode 32 or key " ")
    if (!isTyping && (event.keyCode === 32 || event.key === " ")) {
      event.preventDefault();
      handlePlayPause();
    }
  };
  useEffect(() => {
    document.addEventListener("keydown", handleKeyPress);

    // Clean up the event listener when the component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [handleKeyPress]);

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
          ? `player-dock--full items-stretch ${youtubeVideo ? "p-0 max-[1179px]:overflow-y-auto min-[1180px]:overflow-hidden" : "items-center min-[1180px]:items-stretch"}`
          : `items-center min-[1180px]:items-stretch ${youtubeVideo ? "w-full" : "h-20 w-full px-4 sm:px-8"}`
      }`}
      onClick={() => {
        if (!youtubeVideo && activeSong?.id) {
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
