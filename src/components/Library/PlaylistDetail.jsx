"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import {
  FiCheck,
  FiClock,
  FiGlobe,
  FiHeart,
  FiLock,
  FiMoreHorizontal,
  FiMusic,
  FiPlay,
  FiSearch,
  FiShuffle,
  FiTrash2,
  FiUserPlus,
  FiX,
} from "react-icons/fi";
import { BsPinAngleFill } from "react-icons/bs";
import { addFavourite } from "@/services/dataAPI";
import {
  deletePlaylist,
  deleteSongFromPlaylist,
  getSinglePlaylist,
  updatePlaylist,
} from "@/services/playlistApi";
import {
  getFavouriteLibrary,
  hydrateYouTubeTracks,
  validYouTubeIds,
  valueFromDateMap,
} from "@/services/libraryApi";
import {
  setAutoAdd,
  startYoutubePlayback,
} from "@/redux/features/playerSlice";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import AddToQueueButton from "@/components/AddToQueueButton";
import PlaylistCover from "@/components/PlaylistCover";
import LikePlaylistButton from "@/components/LikePlaylistButton";
import CoverUploader from "@/components/CoverUploader";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import AccessibleDialog from "@/components/AccessibleDialog";
import { PlaylistHeroSkeleton, SongRowsSkeleton } from "@/components/Skeleton";
import MediaImage from "@/components/MediaImage";
import { requestJson } from "@/services/http";
import { PLAYLIST_CATEGORIES } from "@/utils/playlistThemes";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";
import { readNavCache, writeNavCache } from "@/utils/navCache";
import { accountOwner } from "@/utils/accountCache.mjs";

function cleanText(value = "") {
  return cleanTitle(value);
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value === 0) return "—";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function formatTotalDuration(seconds) {
  const minutes = Math.floor((Number(seconds) || 0) / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) return `${hours} hr ${remainingMinutes} min`;
  return `${minutes} min`;
}

function formatAddedDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function interleaveRecommendations(tracks, recommendations) {
  if (recommendations.length === 0) return tracks;
  const userTracks = [...tracks].sort(() => Math.random() - 0.5);
  const recommendationPool = recommendations.filter(
    (item) => !tracks.some((track) => track.id === item.id),
  );
  const queue = [];
  userTracks.forEach((track, index) => {
    queue.push(track);
    if ((index + 1) % 3 === 0 && recommendationPool.length > 0) {
      queue.push(recommendationPool.shift());
    }
  });
  return queue;
}

function LikedCover({ className = "" }) {
  return (
    <div className={`grid place-items-center bg-gradient-to-br from-[#3426a8] via-[#654be5] to-[#b9e7e5] ${className}`}>
      <FiHeart className="h-16 w-16 fill-white text-white sm:h-20 sm:w-20" />
    </div>
  );
}

function AccessGate() {
  return (
    <main className="page text-white">
      <section className="flex flex-col items-start gap-6 rounded-2xl border border-white/10 bg-[#101c28]/85 px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="flex gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-[#00e6e6]"><FiLock /></span>
          <div><h1 className="text-2xl font-bold">Liked Songs are yours to keep</h1><p className="mt-2 text-sm text-gray-300">Save your favorite tracks in one place. Log in or create a free account.</p></div>
        </div>
        <div className="flex gap-2"><Link href="/login" className="btn-primary h-10 px-5 text-sm">Log in</Link><Link href="/signup" className="btn-ghost h-10 px-5 text-sm">Sign up</Link></div>
      </section>
    </main>
  );
}

export default function PlaylistDetail({ kind, playlistId }) {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  return <AccountPlaylistDetail key={`${owner || status}:${kind}:${playlistId || ""}`} kind={kind} playlistId={playlistId} session={session} status={status} owner={owner} />;
}

function AccountPlaylistDetail({ kind, playlistId, session, status, owner }) {
  const isLiked = kind === "liked";
  const router = useRouter();
  const dispatch = useDispatch();
  const { youtubeVideo, autoAdd } = useSelector((state) => state.player);
  const cacheKey = `${isLiked ? "liked" : `playlist:${playlistId || ""}`}:${owner}`;
  const cached = owner ? readNavCache(cacheKey) : null;
  const [collection, setCollection] = useState(() => cached?.collection ?? null);
  const [tracks, setTracks] = useState(() => cached?.tracks ?? []);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [showSearch, setShowSearch] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showCollaborator, setShowCollaborator] = useState(false);
  const [collaboratorEmail, setCollaboratorEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [smartShuffle, setSmartShuffle] = useState(isLiked && autoAdd);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionError, setActionError] = useState(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  useEffect(() => {
    if (!owner) return;
    if (isLiked && status === "unauthenticated") {
      setLoading(false);
      return;
    }

    let active = true;
    const loadCollection = async () => {
      if (!readNavCache(cacheKey)) setLoading(true);
      setError(null);
      try {
        const source = isLiked ? await getFavouriteLibrary() : await getSinglePlaylist(playlistId);
        if (!isLiked && !source?.success) throw source;
        const nextCollection = isLiked ? source : source.data;
        if (!nextCollection || typeof nextCollection !== "object") {
          throw toUserError(null, {
            title: "Collection unavailable",
            message: "We couldn’t load this collection. Please try again.",
          });
        }
        const ids = validYouTubeIds(nextCollection[isLiked ? "favourites" : "songs"]);
        if (isLiked) ids.reverse();
        const hydratedTracks = await hydrateYouTubeTracks(ids);
        const dateMap = nextCollection[isLiked ? "favouriteAddedAt" : "songAddedAt"];
        const datedTracks = hydratedTracks.map((track) => ({
          ...track,
          addedAt: valueFromDateMap(dateMap, track.id),
        }));
        if (active) {
          setCollection(nextCollection);
          setTracks(datedTracks);
          if (!isLiked) setSmartShuffle(Boolean(nextCollection.smartShuffle));
          writeNavCache(cacheKey, { collection: nextCollection, tracks: datedTracks });
        }
      } catch (loadError) {
        if (active) {
          const normalized = toUserError(loadError);
          setError(normalized.code === "UNAUTHORIZED"
            ? normalized
            : toUserError(loadError, {
              title: isLiked ? "Liked Songs unavailable" : "Playlist unavailable",
              message: isLiked
                ? "We couldn’t load your Liked Songs. Please try again."
                : "We couldn’t load this playlist. Please try again.",
            }));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCollection();
    return () => {
      active = false;
    };
  }, [cacheKey, isLiked, playlistId, refreshKey, status, owner]);

  useEffect(() => {
    if (isLiked) setSmartShuffle(autoAdd);
  }, [autoAdd, isLiked]);

  const ownerId = collection?.user?._id || collection?.user;
  const isOwner = isLiked
    ? status === "authenticated"
    : ownerId?.toString() === session?.user?.id;
  const isCollaborator = !isLiked && collection?.collaborators?.some(
    (user) => (user?._id || user)?.toString() === session?.user?.id,
  );
  const canEditTracks = isOwner || isCollaborator;
  const ownerName = isLiked ? session?.user?.name || "You" : collection?.user?.userName || "HeyKasa listener";
  const ownerImage = isLiked ? session?.user?.image : collection?.user?.imageUrl;
  const title = isLiked ? "Liked Songs" : collection?.name || "Playlist";
  const typeLabel = isLiked
    ? "Dynamic Collection"
    : `${collection?.visibility === "public" ? "Public" : "Private"} ${collection?.category || "Pop"} Playlist`;

  const filteredTracks = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return tracks;
    return tracks.filter((track) => `${track.title} ${track.channel}`.toLowerCase().includes(query));
  }, [deferredSearch, tracks]);
  const totalDuration = useMemo(
    () => tracks.reduce((total, track) => total + (track.duration || 0), 0),
    [tracks],
  );

  const fetchSmartRecommendations = async () => {
    if (recommendations.length > 0) return recommendations;
    try {
      const data = await requestJson("/api/recommendations", {
        fallbackTitle: "Recommendations unavailable",
        fallbackMessage: "Smart Shuffle recommendations couldn’t be loaded.",
      });
      const nextRecommendations = [
        ...(Array.isArray(data?.sections?.trending) ? data.sections.trending : []),
        ...(Array.isArray(data?.sections?.charts) ? data.sections.charts : []),
        ...(Array.isArray(data?.sections?.newReleases) ? data.sections.newReleases : []),
      ];
      setRecommendations(nextRecommendations);
      return nextRecommendations;
    } catch {
      return [];
    }
  };

  const createQueue = async () => {
    if (!smartShuffle) return tracks;
    const smartTracks = await fetchSmartRecommendations();
    return interleaveRecommendations(tracks, [...smartTracks]);
  };

  const seedTracks = (items) =>
    items.map((item) => ({
      ...item,
      seedQuery: item.seedQuery || item.genre || title,
      genre: item.genre || title,
    }));

  const playbackContext = {
    type: isLiked ? "liked" : "playlist",
    id: isLiked ? "liked" : String(playlistId || collection?._id || ""),
    name: title,
  };

  const playTrack = async (track) => {
    const queue = seedTracks(await createQueue());
    if (!live.current) return;
    const selected = queue.find((item) => item.id === track.id) || {
      ...track,
      seedQuery: track.seedQuery || track.genre || title,
      genre: track.genre || title,
    };
    dispatch(startYoutubePlayback({
      queue,
      track: selected,
      queueMode: "collection",
      autoExtend: false,
      context: playbackContext,
    }));
  };

  const playCollection = async () => {
    if (tracks.length === 0) return;
    const queue = seedTracks(await createQueue());
    if (!live.current || queue.length === 0) return;
    dispatch(startYoutubePlayback({
      queue,
      track: queue[0],
      queueMode: "collection",
      autoExtend: false,
      context: playbackContext,
    }));
  };

  const reportMutationError = (failure, fallback) => {
    const normalized = toUserError(failure);
    const userError = normalized.code === "UNAUTHORIZED"
      ? normalized
      : toUserError(failure, fallback);
    setActionError(userError);
    toast.error(userError.message);
  };

  const toggleSmartShuffle = async () => {
    const nextValue = !smartShuffle;
    setSmartShuffle(nextValue);
    dispatch(setAutoAdd(nextValue));
    if (nextValue) fetchSmartRecommendations();
    if (!isLiked && isOwner) {
      const response = await updatePlaylist(playlistId, "smartShuffle", nextValue);
      if (!live.current) return;
      if (!response?.success) {
        setSmartShuffle(!nextValue);
        dispatch(setAutoAdd(!nextValue));
        reportMutationError(response, {
          title: "Smart Shuffle not updated",
          message: "We couldn’t update Smart Shuffle. Please try again.",
        });
      } else {
        setActionError(null);
        if (response.data?.playlist) setCollection(response.data.playlist);
      }
    }
  };

  const updateSetting = async (action, value) => {
    setSaving(true);
    const response = await updatePlaylist(playlistId, action, value);
    if (!live.current) return;
    if (response?.success) {
      setActionError(null);
      if (response.data?.playlist) setCollection(response.data.playlist);
      toast.success("Playlist updated");
    } else {
      reportMutationError(response, {
        title: "Playlist not updated",
        message: "We couldn’t update that playlist. Please try again.",
      });
    }
    setSaving(false);
    if (action !== "cover" && action !== "category") setShowOptions(false);
  };

  const addCollaborator = async (event) => {
    event.preventDefault();
    if (!collaboratorEmail.trim()) return;
    setSaving(true);
    const response = await updatePlaylist(playlistId, "addCollaborator", collaboratorEmail);
    if (!live.current) return;
    if (response?.success) {
      setActionError(null);
      if (response.data?.playlist) setCollection(response.data.playlist);
      setCollaboratorEmail("");
      setShowCollaborator(false);
      toast.success("Collaborator added");
    } else {
      reportMutationError(response, {
        title: "Collaborator not added",
        message: "We couldn’t add that collaborator. Please try again.",
      });
    }
    setSaving(false);
  };

  const removeTrack = async (track) => {
    const previousTracks = tracks;
    const previousIndex = tracks.findIndex((item) => item.id === track.id);
    const previousSongIndex = collection?.songs?.indexOf(track.id) ?? -1;
    const restoreTrack = () => {
      setTracks((current) => {
        if (current.some((item) => item.id === track.id)) return current;
        const next = [...current];
        next.splice(Math.min(Math.max(0, previousIndex), next.length), 0, previousTracks[previousIndex] || track);
        return next;
      });
      if (!isLiked) setCollection((current) => {
        if (!current || (current.songs || []).includes(track.id)) return current;
        const songs = [...(current.songs || [])];
        songs.splice(Math.min(Math.max(0, previousSongIndex), songs.length), 0, track.id);
        return { ...current, songs };
      });
    };
    setTracks((current) => current.filter((item) => item.id !== track.id));
    if (!isLiked) {
      setCollection((current) => current ? ({
        ...current,
        songs: Array.isArray(current.songs)
          ? current.songs.filter((id) => id !== track.id)
          : [],
      }) : current);
    }

    if (isLiked) {
      const response = await addFavourite({ id: track.id, liked: false });
      if (!live.current) return;
      if (!response?.success) {
        restoreTrack();
        reportMutationError(response, {
          title: "Liked Songs not updated",
          message: "We couldn’t update your Liked Songs. Please try again.",
        });
        return;
      }
      setActionError(null);
      const nextFavourites = Array.isArray(response.data?.favourites)
        ? response.data.favourites
        : [];
      window.dispatchEvent(Object.assign(new CustomEvent("favourites-changed", { detail: nextFavourites }), { accountOwner: owner }));
      return;
    }
    const response = await deleteSongFromPlaylist(playlistId, track.id);
    if (!live.current) return;
    if (!response?.success) {
      restoreTrack();
      reportMutationError(response, {
        title: "Song not removed",
        message: "We couldn’t remove that song. Please try again.",
      });
      return;
    }
    setActionError(null);
    toast.success("Song removed from playlist");
  };

  const removePlaylist = async () => {
    setSaving(true);
    const response = await deletePlaylist(playlistId);
    if (!live.current) return;
    if (response?.success) {
      setActionError(null);
      toast.success("Playlist deleted");
      router.push("/library");
    } else {
      reportMutationError(response, {
        title: "Playlist not deleted",
        message: "We couldn’t delete that playlist. Please try again.",
      });
      setSaving(false);
    }
  };

  const handleInputFocus = () => dispatch(setIsTyping(true));
  const handleInputBlur = () => dispatch(setIsTyping(false));

  if (!loading && isLiked && status === "unauthenticated") return <AccessGate />;

  return (
    <main className="text-white">
      {!error && collection ? (
        <section className="bg-[linear-gradient(180deg,rgba(100,201,215,0.28),rgba(7,18,29,0.92))] px-[3vw] pb-8 pt-8">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 sm:flex-row sm:items-end">
            {isLiked ? (
              <LikedCover className="aspect-square w-40 shrink-0 rounded-[4px] shadow-2xl sm:w-52 lg:w-60" />
            ) : (
              <PlaylistCover
                playlist={{
                  ...collection,
                  cover: tracks[0]?.thumbnail,
                }}
                showLabel
                className="w-40 shrink-0 rounded-[4px] shadow-2xl sm:w-52 lg:w-60"
              />
            )}
            <div className="min-w-0 pb-1">
              <p className="text-xs font-bold uppercase text-white/80">{typeLabel}</p>
              <h1 className="mt-3 break-words text-4xl font-black sm:text-5xl lg:text-7xl">{title}</h1>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-gray-200">
                {ownerImage ? <img src={ownerImage} alt="" onError={(event) => { event.currentTarget.hidden = true; }} className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10"><FiMusic /></span>}
                <strong className="text-white">{ownerName}</strong>
                <span>&bull;</span>
                <span>{tracks.length.toLocaleString()} {tracks.length === 1 ? "song" : "songs"}, {formatTotalDuration(totalDuration)}</span>
                {!isLiked && collection.collaborators?.length > 0 && <><span>&bull;</span><span>{collection.collaborators.length} collaborator{collection.collaborators.length === 1 ? "" : "s"}</span></>}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mx-auto w-[min(94%,1440px)]">
        {loading && !collection && (
          <div className="mt-8">
            <PlaylistHeroSkeleton />
            <SongRowsSkeleton />
          </div>
        )}
        {!loading && error && (
          <section className="mt-10">
            <UserMessage
              title={error.title}
              message={error.message}
              onRetry={() => setRefreshKey((value) => value + 1)}
              href={error.action === "login" ? "/login" : "/library"}
              hrefLabel={error.action === "login" ? "Log in" : "Back to Library"}
            />
          </section>
        )}
        {!loading && !error && (
          <>
            {actionError ? (
              <div className="pt-6">
                <UserMessage
                  title={actionError.title}
                  message={actionError.message}
                  href={actionError.action === "login" ? "/login" : undefined}
                  hrefLabel="Log in"
                  compact
                />
              </div>
            ) : null}
            <section className="flex flex-wrap items-center gap-2 py-6" aria-label="Playlist actions">
              <button type="button" aria-label={`Play ${title}`} onClick={playCollection} disabled={tracks.length === 0} className="play-fab play-fab--static mr-2 h-14 w-14 min-h-14 min-w-14 disabled:cursor-not-allowed disabled:opacity-40"><FiPlay className="ml-1 fill-current" /></button>
              <button type="button" aria-pressed={smartShuffle} onClick={toggleSmartShuffle} className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold transition duration-200 ease-out active:scale-[0.98] ${smartShuffle ? "bg-[#00e6e6]/15 text-[#00e6e6] ring-1 ring-[#00e6e6]/50" : "text-gray-300 hover:bg-white/10 hover:text-white"}`}><FiShuffle /> Smart Shuffle {smartShuffle ? "On" : "Off"}</button>
              {!isLiked && collection ? <LikePlaylistButton playlist={collection} onChange={(next) => setCollection((current) => current ? ({ ...current, ...next }) : current)} /> : null}
              <button type="button" disabled={!isOwner || isLiked} onClick={() => setShowCollaborator(true)} title={isLiked ? "Dynamic collections cannot have collaborators" : isOwner ? "Add collaborator" : "Only the owner can invite collaborators"} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><FiUserPlus /> <span className="hidden sm:inline">Add collaborator</span></button>
              <button type="button" aria-label="Search in playlist" title="Search in playlist" aria-expanded={showSearch} onClick={() => setShowSearch((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white"><FiSearch /> <span className="hidden sm:inline">Search in playlist</span></button>
              <div className="relative ml-auto">
                <button type="button" aria-label="Playlist options" title="Playlist options" aria-expanded={showOptions} disabled={!isOwner || isLiked} onClick={() => setShowOptions((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full text-xl text-gray-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><FiMoreHorizontal /></button>
                {showOptions && collection && (
                  <div className="absolute right-0 top-12 z-20 w-[min(20rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] rounded-md border border-white/10 bg-[#111d28] p-1.5 text-sm shadow-2xl">
                    <button type="button" disabled={saving} onClick={() => updateSetting("pinned", !collection.pinned)} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left hover:bg-white/10"><BsPinAngleFill /> {collection.pinned ? "Unpin from Library" : "Pin to Library"}</button>
                    <button type="button" disabled={saving} onClick={() => updateSetting("visibility", collection.visibility === "public" ? "private" : "public")} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left hover:bg-white/10">{collection.visibility === "public" ? <FiLock /> : <FiGlobe />} Make {collection.visibility === "public" ? "private" : "public"}</button>
                    <div className="border-t border-white/10 px-3 py-2">
                      <p className="mb-2 text-[10px] font-semibold uppercase text-gray-400">Playlist type</p>
                      <div className="flex flex-wrap gap-1">
                        {PLAYLIST_CATEGORIES.map((item) => (
                          <button
                            key={item}
                            type="button"
                            disabled={saving}
                            onClick={() => updateSetting("category", item)}
                            className={`rounded-full px-2 py-1 text-[10px] ${collection.category === item ? "bg-white text-black" : "bg-white/10 text-gray-300"}`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-white/10 px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <CoverUploader
                        value={collection.coverImage || ""}
                        disabled={saving}
                        onChange={(value) => updateSetting("cover", value)}
                      />
                    </div>
                    <button type="button" disabled={saving} onClick={removePlaylist} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-red-300 hover:bg-red-400/10"><FiTrash2 /> Delete playlist</button>
                  </div>
                )}
              </div>
            </section>

            {showSearch && (
              <label className="relative mb-5 block max-w-md">
                <span className="sr-only">Search tracks in {title}</span>
                <FiSearch aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} onFocus={handleInputFocus} onBlur={handleInputBlur} placeholder="Search by title or artist" className="h-11 w-full rounded-md border border-white/10 bg-white/[0.07] pl-10 pr-10 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[#00e6e6]" />
                {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white"><FiX aria-hidden="true" /></button>}
              </label>
            )}

            <section aria-label={`${title} tracks`}>
              <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/10 px-2 pb-2 text-xs uppercase text-gray-400 md:grid-cols-[44px_minmax(160px,2fr)_minmax(100px,1fr)_60px_96px] lg:grid-cols-[44px_minmax(200px,2fr)_minmax(120px,1fr)_120px_70px_96px]">
                <span className="text-center">#</span><span>Title &amp; artist</span><span className="hidden md:block">Album</span><span className="hidden lg:block">Date added</span><span className="mx-auto hidden md:inline"><FiClock aria-hidden="true" className="inline" /><span className="sr-only">Duration</span></span><span />
              </div>
              {filteredTracks.map((track, index) => (
                <div key={track.id} className={`group grid min-h-[66px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.075] md:grid-cols-[44px_minmax(160px,2fr)_minmax(100px,1fr)_60px_96px] lg:grid-cols-[44px_minmax(200px,2fr)_minmax(120px,1fr)_120px_70px_96px] ${youtubeVideo?.id === track.id ? "bg-white/[0.06]" : ""}`}>
                  <button type="button" aria-label={`Play ${cleanText(track.title)}`} onClick={() => playTrack(track)} className={`grid h-11 w-11 place-items-center rounded-full text-sm ${youtubeVideo?.id === track.id ? "text-[#00e6e6]" : "text-gray-400 group-hover:text-white"}`}><span className="group-hover:hidden">{index + 1}</span><FiPlay className="hidden fill-current group-hover:block" /></button>
                  <button type="button" onClick={() => playTrack(track)} className="flex min-w-0 items-center gap-3 text-left">
                    <MediaImage src={track.thumbnail} size="mq" alt="" onError={(event) => { event.currentTarget.hidden = true; }} className="h-11 w-11 shrink-0 rounded object-cover" />
                    <span className="min-w-0"><span className={`block truncate text-sm font-semibold ${youtubeVideo?.id === track.id ? "text-[#00e6e6]" : "text-white"}`}>{cleanText(track.title)}</span><span className="mt-1 block truncate text-xs text-gray-400">{cleanText(track.channel)}</span></span>
                  </button>
                  <span className="hidden truncate text-xs text-gray-400 md:block">-</span>
                  <span className="hidden text-xs text-gray-400 lg:block">{formatAddedDate(track.addedAt)}</span>
                  <span className="hidden text-right text-xs tabular-nums text-gray-400 md:block">{formatDuration(track.duration)}</span>
                  <div className="flex items-center justify-end gap-1">
                    <AddToQueueButton track={track} className="text-gray-500 opacity-100 hover:text-white sm:opacity-0 sm:group-hover:opacity-100" />
                    {(isLiked || canEditTracks) ? <button type="button" aria-label={isLiked ? `Remove ${cleanText(track.title)} from Liked Songs` : `Remove ${cleanText(track.title)} from playlist`} title={isLiked ? "Remove from Liked Songs" : "Remove from playlist"} onClick={() => removeTrack(track)} className="grid h-11 w-11 place-items-center rounded-full text-gray-500 opacity-100 hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover:opacity-100">{isLiked ? <FiHeart className="fill-current text-[#00e6e6]" /> : <FiTrash2 />}</button> : null}
                  </div>
                </div>
              ))}
              {tracks.length === 0 && (
                <div className="py-8">
                  <EmptyState
                    title="No tracks yet"
                    message="Save music from Home or Search to build this collection."
                  />
                </div>
              )}
              {tracks.length > 0 && filteredTracks.length === 0 && (
                <div className="py-8">
                  <EmptyState
                    title="No matching tracks"
                    message={`No tracks match “${search}”.`}
                    actionLabel="Clear search"
                    onAction={() => setSearch("")}
                  />
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {showCollaborator && (
        <AccessibleDialog
          open={showCollaborator}
          onClose={() => setShowCollaborator(false)}
          titleId="collaborator-title"
          describedBy="collaborator-description"
          closeLabel="Close add collaborator dialog"
          panelClassName="w-full max-w-md rounded-lg border border-white/10 bg-[#0c1823] p-6 shadow-2xl"
        >
          <form onSubmit={addCollaborator}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="collaborator-title" className="text-xl font-bold">Add a collaborator</h2>
                <p id="collaborator-description" className="mt-2 text-sm text-gray-400">They can add and remove tracks from this playlist.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setShowCollaborator(false)} className="grid h-11 w-11 place-items-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white">
                <FiX aria-hidden="true" />
              </button>
            </div>
            <label htmlFor="collaborator-email" className="mt-6 block text-xs font-semibold uppercase text-gray-400">Account email</label>
            <input
              id="collaborator-email"
              type="email"
              required
              value={collaboratorEmail}
              onChange={(event) => setCollaboratorEmail(event.target.value)}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              placeholder="listener@example.com"
              className="mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm normal-case text-white outline-none focus:border-[#00e6e6]"
            />
            <button type="submit" disabled={saving} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-black disabled:opacity-50">
              <FiCheck aria-hidden="true" /> {saving ? "Adding..." : "Add collaborator"}
            </button>
          </form>
        </AccessibleDialog>
      )}
    </main>
  );
}
