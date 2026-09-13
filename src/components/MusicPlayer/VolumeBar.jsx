import React, { useEffect, useRef, useState } from "react";
import { BiAddToQueue } from "react-icons/bi";
import { addSongToPlaylist, getUserPlaylists } from "@/services/playlistApi";
import { toast } from "react-hot-toast";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

const VolumeBar = ({
  value,
  min,
  max,
  onChange,
  setVolume,
  activeSong,
  bgColor,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const menuRef = useRef(null);

  useEffect(() => {
    const getPlaylists = async () => {
      const res = await getUserPlaylists();
      if (res?.success == true) {
        setPlaylists(res?.data?.playlists);
      }
    };
    getPlaylists();
  }, []);

  useDismissOnOutside(showMenu, () => setShowMenu(false), [menuRef], { escape: true });

  // add song to playlist
  const handleAddToPlaylist = async (song, playlistID) => {
    setShowMenu(false);
    const res = await addSongToPlaylist(playlistID, song);
    if (res?.success == true) {
      toast.success(res?.message);
    } else {
      toast.error(res?.message);
    }
  };
  return (
    <>
      <div className="hidden min-[1180px]:flex flex-1 items-center justify-end">
        <div ref={menuRef} className=" relative">
          <button
            type="button"
            aria-label="Add to playlist"
            aria-expanded={showMenu}
            aria-haspopup="menu"
            title="Add to Playlist"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="m-3 grid place-items-center rounded-full p-1 text-white hover:bg-white/10"
          >
            <BiAddToQueue size={25} aria-hidden="true" />
          </button>
          {showMenu && (
            <div
              role="menu"
              aria-label="Add to playlist"
              className="absolute text-white bottom-[130%] backdrop-blur-lg rounded-lg p-3 w-32 flex flex-col gap-2 z-[100]"
              style={{
                backgroundColor: bgColor
                  ? `rgba(${bgColor.red}, ${bgColor.green}, ${bgColor.blue}, 0.3)`
                  : "rgba(0,0,0,0.2)",
                backdropFilter: "blur(20px)",
              }}
            >
              <p className="text-sm font-semibold flex gap-1 border-b border-white items-center">
                Add to Playlist
              </p>
              {playlists?.length > 0 ? (
                playlists?.map((playlist, index) => (
                  <button
                    key={playlist?._id || index}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToPlaylist(activeSong?.id, playlist._id);
                    }}
                    className="text-sm font-semibold flex gap-1 items-center hover:underline"
                  >
                    {playlist?.name}
                  </button>
                ))
              ) : (
                <p className="text-sm font-semibold flex gap-1 items-center">
                  No Playlist
                </p>
              )}
            </div>
          )}
        </div>
        {/* Volume lives in PlayerVolume on the dock. */}
      </div>
      {/* overlay */}
      {showMenu && (
        <button
          type="button"
          aria-label="Close playlist menu"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(false);
          }}
          className="absolute bottom-0 left-0 z-[50] h-screen w-screen cursor-default"
        />
      )}
    </>
  );
};

export default React.memo(VolumeBar);
