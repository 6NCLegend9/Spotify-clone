"use client";
import { useCallback, useEffect, useState } from "react";
import {
  playPause,
  setActiveSong,
  setFullScreen,
} from "@/redux/features/playerSlice";
import { BsPlayFill } from "react-icons/bs";
import { useDispatch } from "react-redux";
import SongListSkeleton from "./SongListSkeleton";
import { BiHeadphone } from "react-icons/bi";
import { useSelector } from "react-redux";
import { PiDotsThreeVerticalBold } from "react-icons/pi";
import {
  addSongToPlaylist,
  deleteSongFromPlaylist,
  getUserPlaylists,
} from "@/services/playlistApi";
import { cleanTitle } from "@/utils/text";
import { toast } from "react-hot-toast";
import { MdOutlineDeleteOutline } from "react-icons/md";
import EmptyState from "./EmptyState";
import UserMessage from "./UserMessage";
import { toUserError } from "@/utils/userError";
import { useSession } from "next-auth/react";

const SongsList = ({
  SongData,
  loading,
  hidePlays,
  isUserPlaylist,
  playlistID,
  setSongs,
  onRetry,
}) => {
  const { activeSong } = useSelector((state) => state.player);
  const { status } = useSession();
  const [showMenu, setShowMenu] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [playlistLoading, setPlaylistLoading] = useState(true);
  const [playlistError, setPlaylistError] = useState(null);
  const [mutatingId, setMutatingId] = useState(null);
  const dispatch = useDispatch();

  const handlePlayClick = (song, index) => {
    dispatch(setActiveSong({ song, data: SongData, i: index }));
    dispatch(setFullScreen(true));
    dispatch(playPause(true));
  };

  function formatDuration(durationInSeconds) {
    const duration = Math.max(0, Number(durationInSeconds) || 0);
    if (duration === 0) return "—";
    const minutes = Math.floor(duration / 60);
    const seconds = Math.round(duration % 60);

    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    } else {
      return `${seconds}`;
    }
  }

  const loadPlaylists = useCallback(async () => {
    if (isUserPlaylist) {
      setPlaylistLoading(false);
      setPlaylistError(null);
      return;
    }
    if (status === "loading") {
      setPlaylistLoading(true);
      return;
    }
    if (status !== "authenticated") {
      setPlaylists([]);
      setPlaylistError(toUserError({ code: "UNAUTHORIZED" }));
      setPlaylistLoading(false);
      return;
    }

    setPlaylistLoading(true);
    setPlaylistError(null);
    const res = await getUserPlaylists();
    if (res?.success === true) {
      setPlaylists(
        Array.isArray(res.data?.playlists)
          ? res.data.playlists.filter(
            (playlist) => playlist && typeof playlist === "object" && playlist._id,
          )
          : [],
      );
    } else {
      setPlaylists([]);
      const normalized = toUserError(res);
      setPlaylistError(normalized.code === "UNAUTHORIZED"
        ? normalized
        : toUserError(res, {
          title: "Playlists unavailable",
          message: "We couldn’t load your playlists. Please try again.",
        }));
    }
    setPlaylistLoading(false);
  }, [isUserPlaylist, status]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  // add song to playlist
  const handleAddToPlaylist = async (song, playlistID) => {
    setShowMenu(false);
    setMutatingId(song);
    const res = await addSongToPlaylist(playlistID, song);
    setMutatingId(null);
    if (res?.success === true) {
      toast.success("Song added to playlist");
    } else {
      const normalized = toUserError(res);
      toast.error((normalized.code === "UNAUTHORIZED"
        ? normalized
        : toUserError(res, {
          title: "Song not added",
          message: "We couldn’t add that song. Please try again.",
        })).message);
    }
  };

  // delete song from playlist
  const handleDeleteFromPlaylist = async (playlistID, song) => {
    setShowMenu(false);
    const previousSongs = Array.isArray(SongData) ? SongData : [];
    setMutatingId(song);
    setSongs?.((current) => (
      Array.isArray(current)
        ? current.filter((item) => item?.id?.toString() !== song.toString())
        : []
    ));
    const res = await deleteSongFromPlaylist(playlistID, song);
    setMutatingId(null);
    if (res?.success === true) {
      toast.success("Song removed from playlist");
    } else {
      setSongs?.(previousSongs);
      const normalized = toUserError(res);
      toast.error((normalized.code === "UNAUTHORIZED"
        ? normalized
        : toUserError(res, {
          title: "Song not removed",
          message: "We couldn’t remove that song. Please try again.",
        })).message);
    }
  };

  const songLoading = Boolean(loading) && !Array.isArray(SongData);

  return (
    <>
      <div className="mt-5">
        {songLoading ? <SongListSkeleton /> : null}
        {!songLoading && !Array.isArray(SongData) ? (
          <UserMessage
            title="Songs unavailable"
            message="We couldn’t load these songs. Please try again."
            onRetry={onRetry}
          />
        ) : null}
        {!songLoading && Array.isArray(SongData) && SongData.length === 0 ? (
          <EmptyState
            title="No songs yet"
            message="Songs added to this collection will appear here."
          />
        ) : null}
        {!songLoading && Array.isArray(SongData) && SongData.length > 0 ? (
          SongData?.map((song, index) => {
            const trackName = cleanTitle(song?.name, "Untitled track");
            return (
            <div
              key={song?.id || index}
              className={`song-row group mt-1 flex items-center justify-between rounded-lg border-b border-white/10 px-2 py-2.5 transition hover:bg-white/5 ${
                activeSong?.id === song?.id && " text-[#00e6e6]"
              }`}
            >
              <button
                type="button"
                onClick={() => handlePlayClick(song, index)}
                className="flex min-w-0 flex-1 items-center gap-5 text-left"
                aria-label={`Play ${trackName}`}
              >
                <div className=" relative mb-3">
                  <img
                    src={song?.image?.[2]?.url || song?.image?.[1]?.url || song?.image?.[0]?.url || ""}
                    alt=""
                    onError={(event) => { event.currentTarget.hidden = true; }}
                    width={50}
                    height={50}
                    className=" rounded-lg w-12 h-12 md:w-14 md:h-14 object-cover"
                  />
                  {activeSong?.id === song?.id ? (
                    <BiHeadphone
                      size={27}
                      aria-hidden="true"
                      className=" absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#00e6e6]"
                    />
                  ) : (
                    <BsPlayFill
                      size={25}
                      aria-hidden="true"
                      className=" group-hover:block hidden absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-200"
                    />
                  )}
                </div>
                <div className=" w-24 md:w-64">
                  <p className="text-sm lg:text-lg font-semibold truncate">
                    {trackName}
                  </p>
                  <p className="text-gray-400 truncate text-xs">
                    {Array.isArray(song?.artists?.primary)
                      ? song.artists.primary.map((artist) => artist?.name).join(", ")
                      : Array.isArray(song?.artists)
                      ? song.artists.map((artist) => artist?.name).join(", ")
                      : song?.artists?.primary || ""}
                  </p>
                </div>
              </button>
              <div
                className={`hidden w-36 ${
                  hidePlays ? "lg:hidden" : "lg:block"
                }`}
              >
                {song?.playCount && (
                  <p className="text-gray-400">{song?.playCount} plays</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <p>{formatDuration(song?.duration)}</p>
                <div className=" flex gap-2 items-center relative">
                  <button
                    type="button"
                    aria-label={`More actions for ${trackName}`}
                    aria-expanded={showMenu === song?.id}
                    aria-haspopup="menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(song?.id);
                    }}
                    className="grid h-11 w-11 place-items-center rounded-full text-gray-300 hover:bg-white/10"
                  >
                    <PiDotsThreeVerticalBold size={25} aria-hidden="true" />
                  </button>
                  {showMenu === song?.id && (
                    <div
                      role="menu"
                      aria-label={`Actions for ${trackName}`}
                      className="absolute right-0 top-0 z-40 flex w-40 flex-col gap-2 rounded-xl border border-white/10 bg-[#07121d] p-3 text-white shadow-dock"
                    >
                      <p className="text-sm font-semibold flex gap-1 empty:hidden border-b border-white items-center">
                        {isUserPlaylist ? null : "Add to playlist"}
                      </p>
                      {isUserPlaylist ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={mutatingId === song?.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFromPlaylist(playlistID, song?.id);
                          }}
                          className="text-sm font-semibold flex gap-1 items-center hover:underline"
                        >
                          <MdOutlineDeleteOutline size={20} aria-hidden="true" /> Remove
                        </button>
                      ) : playlistLoading ? (
                        <p className="text-xs text-gray-400">Loading playlists…</p>
                      ) : playlistError ? (
                        <UserMessage
                          compact
                          title={playlistError.title}
                          message={playlistError.message}
                          onRetry={loadPlaylists}
                          href={playlistError.action === "login" ? "/login" : undefined}
                          hrefLabel="Log in"
                        />
                      ) : playlists.length > 0 ? (
                        playlists?.map((playlist, index) => (
                          <button
                            key={playlist?._id || index}
                            type="button"
                            role="menuitem"
                            disabled={mutatingId === song?.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToPlaylist(song?.id, playlist._id);
                            }}
                            className="text-sm font-semibold flex gap-1 items-center hover:underline"
                          >
                            {playlist?.name}
                          </button>
                        ))
                      ) : (
                        <EmptyState
                          title="No playlists yet"
                          message="Create a playlist before adding this song."
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })
        ) : null}
      </div>
      {/* overlay */}
      {showMenu && (
        <button
          type="button"
          aria-label="Close song actions"
          onClick={() => setShowMenu(false)}
          className="fixed top-0 left-0 z-30 h-full w-full cursor-default"
        />
      )}
    </>
  );
};

export default SongsList;
