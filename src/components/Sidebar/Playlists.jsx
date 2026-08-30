"use client";

import { useEffect, useState } from "react";
import { FaPlus } from "react-icons/fa";
import { MdPlaylistPlay, MdOutlineDeleteOutline } from "react-icons/md";
import { PiDotsThreeVerticalBold } from "react-icons/pi";
import Link from "next/link";
import PlaylistModal from "./PlaylistModal";
import { deletePlaylist, getUserPlaylists } from "@/services/playlistApi";
import { useNav } from "../Layout/AppShell";

const Playlists = () => {
  const { setShowNav } = useNav();
  const [show, setShow] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const getPlaylists = async () => {
      const res = await getUserPlaylists();
      if (res?.success == true) {
        setPlaylists(res?.data?.playlists);
      }
    };
    getPlaylists();
  }, [show]);

  const handleDelete = async (id) => {
    const res = await deletePlaylist(id);
    if (res?.success == true) {
      setPlaylists(playlists.filter((playlist) => playlist._id !== id));
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-2 py-2">
        <p className="text-sm font-semibold text-white">Playlists</p>
        <button
          type="button"
          onClick={() => setShow(true)}
          className="icon-btn h-8 w-8"
          aria-label="Create playlist"
        >
          <FaPlus className="text-xs" />
        </button>
      </div>
      <div className="flex max-h-52 flex-col overflow-y-auto">
        {playlists?.map((playlist) => (
          <div
            key={playlist._id}
            className="group flex items-center justify-between rounded-lg pr-1 hover:bg-white/5"
          >
            <Link
              href={`/library/playlist/${playlist._id}`}
              onClick={() => setShowNav(false)}
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2"
            >
              <MdPlaylistPlay className="shrink-0 text-[#00e6e6]" />
              <p className="truncate text-sm text-white">{playlist.name}</p>
            </Link>
            <div className="relative">
              <button
                type="button"
                aria-label={`Playlist options for ${playlist.name}`}
                onClick={() => setShowMenu(playlist._id)}
                className="grid h-8 w-8 place-items-center text-[#9aa8b5] hover:text-white"
              >
                <PiDotsThreeVerticalBold size={18} />
              </button>
              {showMenu === playlist._id && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    handleDelete(playlist._id);
                  }}
                  className="absolute right-0 top-8 z-50 flex items-center gap-1 rounded-lg border border-white/10 bg-[#07121d] px-3 py-2 text-xs text-white shadow-xl hover:bg-white/10"
                >
                  Delete <MdOutlineDeleteOutline size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <PlaylistModal show={show} setShow={setShow} />
      {showMenu && (
        <div
          onClick={() => setShowMenu(false)}
          className="fixed inset-0 z-30"
        />
      )}
    </>
  );
};

export default Playlists;
