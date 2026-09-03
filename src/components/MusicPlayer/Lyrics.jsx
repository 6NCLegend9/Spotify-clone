"use client";
import { useState } from "react";
import React from "react";
import { useSelector } from "react-redux";
import SongsList from "../SongsList";
import { useDispatch } from "react-redux";
import { playPause, setAutoAdd, setYoutubeVideo } from "@/redux/features/playerSlice";
import UserMessage from "@/components/UserMessage";
import SyncedLyrics from "./SyncedLyrics";
import { THUMB_FALLBACK } from "@/utils/imageOptimize";

const Lyrics = ({ activeSong, currentTime = 0, duration = 0, onSeek }) => {
  const dispatch = useDispatch();
  const { currentSongs, autoAdd, youtubeVideo, youtubeQueue } = useSelector((state) => state.player);
  const [activeTab, setActiveTab] = useState("lyrics");
  const playableYoutubeQueue = Array.isArray(youtubeQueue)
    ? youtubeQueue.filter((item) => item?.id)
    : [];
  const nativeQueue = Array.isArray(currentSongs) ? currentSongs : [];

  const title = youtubeVideo?.title || activeSong?.name || activeSong?.title || "";
  const artist = youtubeVideo?.channel
    || (Array.isArray(activeSong?.artists?.primary)
      ? activeSong.artists.primary.map((item) => item?.name).filter(Boolean).join(", ")
      : typeof activeSong?.artists === "string"
        ? activeSong.artists
        : activeSong?.primaryArtists || activeSong?.channel || "");
  const lyricDuration = Number(youtubeVideo?.duration || activeSong?.duration) || duration;

  const handleAutoAdd = (checked) => {
    if (checked) {
      dispatch(setAutoAdd(true));
      localStorage.setItem("autoAdd", true);
    } else {
      dispatch(setAutoAdd(false));
      localStorage.setItem("autoAdd", false);
    }
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="flex justify-center items-center w-full">
        <button
          onClick={() => {
            setActiveTab("queue");
          }}
          className={`${
            activeTab === "queue" ? "border-[#00e6e6] border-b-2" : ""
          } text-white text-xl m-3 font-medium `}
        >
          Queue
        </button>
        <button
          onClick={() => {
            setActiveTab("lyrics");
          }}
          className={`${
            activeTab === "lyrics" ? "border-[#00e6e6] border-b-2" : ""
          } text-white text-xl m-3 font-medium`}
        >
          Lyrics
        </button>
      </div>
      <div className="min-[1180px]:max-h-[30rem] overflow-y-auto">
        {activeTab === "lyrics" ? (
          <SyncedLyrics
            title={title}
            artist={artist}
            duration={lyricDuration}
            currentTime={currentTime}
            onSeek={onSeek}
            className="md:w-[450px]"
          />
        ) : (
          <div>
            {!youtubeVideo && (
            <div
              className=" flex justify-between gap-7 mt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <p className=" text-white font-medium">
                Auto add similar songs to queue
              </p>

              <label
                htmlFor="autoAddButton"
                className="relative inline-flex items-center mb-1 cursor-pointer mr-4"
              >
                <input
                  onChange={(e) => {
                    handleAutoAdd(e.target.checked);
                  }}
                  type="checkbox"
                  checked={autoAdd}
                  className="sr-only peer"
                  name="autoAddButton"
                  id="autoAddButton"
                  placeholder="autoAddButton"
                  title={autoAdd ? "on" : "off"}
                ></input>
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none ring-2  ring-gray-500 ch rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-[#00e6e6]"></div>
              </label>
            </div>
            )}
            {youtubeVideo ? (
              playableYoutubeQueue.length > 0 ? (
                <div className="mt-2 md:w-[450px]">
                  {playableYoutubeQueue.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (!item?.id) return;
                        dispatch(playPause(true));
                        dispatch(setYoutubeVideo(item));
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/10 ${item.id === youtubeVideo.id ? "bg-white/10" : ""}`}
                    >
                      <img
                        src={item.thumbnail || THUMB_FALLBACK}
                        alt=""
                        onError={(event) => {
                          if (event.currentTarget.src !== THUMB_FALLBACK) {
                            event.currentTarget.src = THUMB_FALLBACK;
                          }
                        }}
                        className="h-11 w-11 rounded object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-white">{item.title}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-5 p-4 sm:p-0 md:w-[450px]">
                  <UserMessage
                    tone="info"
                    title="Queue is empty"
                    message="Add a track to keep listening."
                    compact
                  />
                </div>
              )
            ) : nativeQueue.length > 0 ? (
              <div className=" text-white p- mt- md:w-[450px] md:h-full overflow-y-scroll hideScrollBar ">
                <SongsList
                  SongData={nativeQueue}
                  loading={false}
                  hidePlays={true}
                  activeSong={activeSong}
                />
              </div>
            ) : (
              <div className="mt-5 p-4 sm:p-0 md:w-[450px]">
                <UserMessage
                  tone="info"
                  title="Queue is empty"
                  message="Add a track to keep listening."
                  compact
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Lyrics;
