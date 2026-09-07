"use client";
import React from "react";
import { MdSkipNext, MdSkipPrevious } from "react-icons/md";
import { BsFillPauseFill, BsFillPlayFill } from "react-icons/bs";
import { TbRepeat, TbRepeatOnce, TbArrowsShuffle } from "react-icons/tb";
import Downloader from "./Downloader";
import FavouriteButton from "./FavouriteButton";

const iconButtonClass = "grid min-h-[44px] min-w-[44px] place-items-center rounded-full text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00e6e6]";

const Controls = ({
  isPlaying,
  repeat,
  setRepeat,
  shuffle,
  setShuffle,
  currentSongs,
  handlePlayPause,
  handlePrevSong,
  handleNextSong,
  activeSong,
  fullScreen,
  handleAddToFavourite,
  favouriteSongs,
  loading,
}) => {
  const hasQueue = Boolean(currentSongs?.length);

  return (
    <div className="flex items-center justify-around md:w-80 text-lg lg:w-80 2xl:w-80 gap-4 sm:gap-0">
      <FavouriteButton
        favouriteSongs={favouriteSongs}
        activeSong={activeSong}
        loading={loading}
        handleAddToFavourite={handleAddToFavourite}
        style={" sm:block hidden"}
      />
      <button
        type="button"
        title={repeat ? "Repeat one" : "Repeat"}
        aria-label={repeat ? "Repeat one, on" : "Repeat"}
        aria-pressed={repeat}
        onClick={(e) => {
          e.stopPropagation();
          setRepeat((prev) => !prev);
        }}
        className={`${iconButtonClass} ${!fullScreen ? "hidden sm:grid" : "m-3"} p-1`}
      >
        {repeat ? (
          <TbRepeatOnce size={25} color="#00e6e6" aria-hidden="true" />
        ) : (
          <TbRepeat size={25} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        title="Previous (Alt + ←)"
        aria-label="Previous song"
        disabled={!hasQueue}
        onClick={handlePrevSong}
        className={`${iconButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <MdSkipPrevious size={35} aria-hidden="true" />
      </button>
      <button
        type="button"
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={handlePlayPause}
        className={iconButtonClass}
      >
        {isPlaying ? (
          <BsFillPauseFill size={45} color="#00e6e6" aria-hidden="true" />
        ) : (
          <BsFillPlayFill size={45} color="#00e6e6" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        title="Next (Alt + →)"
        aria-label="Next song"
        disabled={!hasQueue}
        onClick={handleNextSong}
        className={`${iconButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <MdSkipNext size={35} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Shuffle"
        aria-label={shuffle ? "Shuffle, on" : "Shuffle"}
        aria-pressed={shuffle}
        onClick={(e) => {
          e.stopPropagation();
          setShuffle((prev) => !prev);
        }}
        className={`${iconButtonClass} ${!fullScreen ? "hidden sm:grid" : "m-3"} p-1`}
      >
        <TbArrowsShuffle size={25} color={shuffle ? "#00e6e6" : "white"} aria-hidden="true" />
      </button>
      {activeSong?.downloadUrl?.[4]?.url && (
        <div className=" hidden sm:block mt-1 ">
          <Downloader activeSong={activeSong} fullScreen={fullScreen} />
        </div>
      )}
    </div>
  );
};

export default Controls;
