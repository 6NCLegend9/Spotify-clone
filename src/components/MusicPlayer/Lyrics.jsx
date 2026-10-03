"use client";
import { useState } from "react";
import React from "react";
import { useSelector } from "react-redux";
import SongsList from "../SongsList";
import UserMessage from "@/components/UserMessage";
import SyncedLyrics from "./SyncedLyrics";
import { cleanTitle } from "@/utils/text";

const Lyrics = ({ activeSong, currentTime = 0, duration = 0, onSeek }) => {
  const { currentSongs } = useSelector((state) => state.player);
  const [activeTab, setActiveTab] = useState("lyrics");
  const nativeQueue = Array.isArray(currentSongs) ? currentSongs : [];

  const title = cleanTitle(activeSong?.name || activeSong?.title || "");
  const artist = cleanTitle(
    Array.isArray(activeSong?.artists?.primary)
      ? activeSong.artists.primary.map((item) => item?.name).filter(Boolean).join(", ")
      : typeof activeSong?.artists === "string"
        ? activeSong.artists
        : activeSong?.primaryArtists || activeSong?.channel || "",
  );
  const lyricDuration = Number(activeSong?.duration) || duration;


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
            {nativeQueue.length > 0 ? (
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
