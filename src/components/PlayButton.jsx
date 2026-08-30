"use client";

import { useDispatch } from "react-redux";
import { BsFillPlayFill } from "react-icons/bs";
import { playPause, setActiveSong } from "@/redux/features/playerSlice";
import BulkDownloadButton from "./BulkDownloadButton";

const PlayButton = ({ songList }) => {
  const dispatch = useDispatch();
  const handlePlayClick = (song, index) => {
    dispatch(setActiveSong({ song, data: songList?.songs, i: index }));
    dispatch(playPause(true));
  };
  return (
    <div className="mt-5 flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={() => {
          handlePlayClick(songList?.songs?.[0], 0);
        }}
        className="btn-primary h-12 w-full sm:w-auto sm:min-w-[220px]"
      >
        <BsFillPlayFill size={24} />
        Play
      </button>
      <BulkDownloadButton songList={songList} />
    </div>
  );
};

export default PlayButton;
