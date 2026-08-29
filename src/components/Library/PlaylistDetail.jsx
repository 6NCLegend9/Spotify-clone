"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
  FiSettings,
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
  setYoutubeQueue,
  setYoutubeVideo,
} from "@/redux/features/playerSlice";
import { setIsTyping } from "@/redux/features/loadingBarSlice";

function cleanText(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"');
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
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
    <main className="mx-auto min-h-screen w-[min(94%,1100px)] pb-24 pt-12 text-white">
      <section className="flex flex-col items-start gap-6 border-y border-white/10 bg-[#101c28]/85 px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="flex gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-[#00e6e6]"><FiLock /></span>
          <div><h1 className="text-2xl font-bold">Liked Songs are yours to keep</h1><p className="mt-2 text-sm text-gray-300">Save your favorite tracks in one place. Log in or create a free account.</p></div>
        </div>
        <div className="flex gap-2"><Link href="/login" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">Log in</Link><Link href="/signup" className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-bold">Sign up</Link></div>
      </section>
    </main>
  );
}

export default function PlaylistDetail({ kind, playlistId }) {
  const isLiked = kind === "liked";
  const router = useRouter();
  const dispatch = useDispatch();
  const { data: session, status } = useSession();
  const { youtubeVideo, autoAdd } = useSelector((state) => state.player);
  const [collection, setCollection] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [showSearch, setShowSearch] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showCollaborator, setShowCollaborator] = useState(false);
  const [collaboratorEmail, setCollaboratorEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [smartShuffle, setSmartShuffle] = useState(isLiked && autoAdd);

  useEffect(() => {
    if (status === "loading") return;
    if (isLiked && status === "unauthenticated") {
      setLoading(false);
      return;
    }

    let active = true;
    const loadCollection = async () => {
      setLoading(true);
      setError("");
      try {
        const source = isLiked ? await getFavouriteLibrary() : await getSinglePlaylist(playlistId);
        if (!isLiked && !source?.success) throw new Error(source?.message || "Playlist could not be loaded.");
        const nextCollection = isLiked ? source : source.data;
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
          setSmartShuffle(isLiked ? autoAdd : Boolean(nextCollection.smartShuffle));
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCollection();
    return () => {
      active = false;
    };
  }, [autoAdd, isLiked, playlistId, status]);

  const ownerId = collection?.user?._id || collection?.user;
  const isOwner = isLiked
    ? status === "authenticated"
    : ownerId?.toString() === session?.user?.id;
  const isCollaborator = !isLiked && collection?.collaborators?.some(
    (user) => (user?._id || user)?.toString() === session?.user?.id,
  );
  const canEditTracks = isOwner || isCollaborator;
  const ownerName = isLiked ? session?.user?.name || "You" : collection?.user?.userName || "Hayasaka listener";
  const ownerImage = isLiked ? session?.user?.image : collection?.user?.imageUrl;
  const title = isLiked ? "Liked Songs" : collection?.name || "Playlist";
  const typeLabel = isLiked ? "Dynamic Collection" : `${collection?.visibility === "public" ? "Public" : "Private"} Playlist`;

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
      const response = await fetch("/api/recommendations");
      if (!response.ok) return [];
      const data = await response.json();
      const nextRecommendations = [
        ...(data.sections?.trending || []),
        ...(data.sections?.charts || []),
        ...(data.sections?.newReleases || []),
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

  const playTrack = async (track) => {
    const queue = await createQueue();
    dispatch(setYoutubeQueue(queue));
    dispatch(setYoutubeVideo(track));
  };

  const playCollection = async () => {
    if (tracks.length === 0) return;
    const queue = await createQueue();
    dispatch(setYoutubeQueue(queue));
    dispatch(setYoutubeVideo(queue[0]));
  };

  const toggleSmartShuffle = async () => {
    const nextValue = !smartShuffle;
    setSmartShuffle(nextValue);
    dispatch(setAutoAdd(nextValue));
    if (nextValue) fetchSmartRecommendations();
    if (!isLiked && isOwner) {
      const response = await updatePlaylist(playlistId, "smartShuffle", nextValue);
      if (!response?.success) {
        setSmartShuffle(!nextValue);
        dispatch(setAutoAdd(!nextValue));
        toast.error(response?.message || "Smart Shuffle could not be updated.");
      } else {
        setCollection(response.data.playlist);
      }
    }
  };

  const updateSetting = async (action, value) => {
    setSaving(true);
    const response = await updatePlaylist(playlistId, action, value);
    if (response?.success) {
      setCollection(response.data.playlist);
      toast.success(response.message);
    } else {
      toast.error(response?.message || "Playlist could not be updated.");
    }
    setSaving(false);
    setShowOptions(false);
  };

  const addCollaborator = async (event) => {
    event.preventDefault();
    if (!collaboratorEmail.trim()) return;
    setSaving(true);
    const response = await updatePlaylist(playlistId, "addCollaborator", collaboratorEmail);
    if (response?.success) {
      setCollection(response.data.playlist);
      setCollaboratorEmail("");
      setShowCollaborator(false);
      toast.success(response.message);
    } else {
      toast.error(response?.message || "Collaborator could not be added.");
    }
    setSaving(false);
  };

  const removeTrack = async (track) => {
    if (isLiked) {
      const response = await addFavourite({ id: track.id });
      if (!response?.success) return toast.error(response?.message || "Liked Songs could not be updated.");
      setTracks((current) => current.filter((item) => item.id !== track.id));
      window.dispatchEvent(new CustomEvent("favourites-changed", { detail: response.data.favourites }));
      return;
    }
    const response = await deleteSongFromPlaylist(playlistId, track.id);
    if (!response?.success) return toast.error(response?.message || "Track could not be removed.");
    setTracks((current) => current.filter((item) => item.id !== track.id));
    setCollection((current) => ({
      ...current,
      songs: current.songs.filter((id) => id !== track.id),
    }));
  };

  const removePlaylist = async () => {
    setSaving(true);
    const response = await deletePlaylist(playlistId);
    if (response?.success) {
      toast.success("Playlist deleted");
      router.push("/library");
    } else {
      toast.error(response?.message || "Playlist could not be deleted.");
      setSaving(false);
    }
  };

  const handleInputFocus = () => dispatch(setIsTyping(true));
  const handleInputBlur = () => dispatch(setIsTyping(false));

  if (!loading && isLiked && status === "unauthenticated") return <AccessGate />;

  return (
    <main className="min-h-screen pb-28 text-white">
      <section className="bg-[linear-gradient(180deg,rgba(40,78,88,0.92),rgba(7,18,29,0.86))] px-[3vw] pb-8 pt-10">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 sm:flex-row sm:items-end">
          {isLiked ? (
            <LikedCover className="aspect-square w-40 shrink-0 rounded-md shadow-2xl sm:w-52 lg:w-60" />
          ) : collection?.songs?.length > 0 && tracks[0]?.thumbnail ? (
            <img src={tracks[0].thumbnail} alt="" className="aspect-square w-40 shrink-0 rounded-md object-cover shadow-2xl sm:w-52 lg:w-60" />
          ) : (
            <div className="grid aspect-square w-40 shrink-0 place-items-center rounded-md bg-[#172736] text-gray-400 shadow-2xl sm:w-52 lg:w-60"><FiMusic className="h-16 w-16" /></div>
          )}
          <div className="min-w-0 pb-1">
            <p className="text-xs font-bold uppercase text-white/80">{typeLabel}</p>
            <h1 className="mt-3 break-words text-4xl font-black sm:text-5xl lg:text-7xl">{title}</h1>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-gray-200">
              {ownerImage ? <img src={ownerImage} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10"><FiMusic /></span>}
              <strong className="text-white">{ownerName}</strong>
              <span>&bull;</span>
              <span>{tracks.length.toLocaleString()} {tracks.length === 1 ? "song" : "songs"}, {formatTotalDuration(totalDuration)}</span>
              {!isLiked && collection?.collaborators?.length > 0 && <><span>&bull;</span><span>{collection.collaborators.length} collaborator{collection.collaborators.length === 1 ? "" : "s"}</span></>}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-[min(94%,1440px)]">
        {loading && <div className="mt-8 h-64 animate-pulse rounded-md bg-white/[0.06]" />}
        {!loading && error && <section className="mt-10 border-y border-white/10 py-10 text-center"><h2 className="text-xl font-bold">This playlist is unavailable</h2><p className="mt-2 text-sm text-amber-300">{error}</p><Link href="/library" className="mt-5 inline-block rounded-full bg-white px-5 py-2 text-sm font-bold text-black">Back to Library</Link></section>}
        {!loading && !error && (
          <>
            <section className="flex flex-wrap items-center gap-2 py-6" aria-label="Playlist actions">
              <button type="button" aria-label={`Play ${title}`} onClick={playCollection} disabled={tracks.length === 0} className="mr-2 grid h-14 w-14 place-items-center rounded-full bg-[#1ed760] text-xl text-black transition hover:scale-105 hover:bg-[#3be477] disabled:cursor-not-allowed disabled:opacity-40"><FiPlay className="ml-1 fill-current" /></button>
              <button type="button" aria-pressed={smartShuffle} onClick={toggleSmartShuffle} className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold transition ${smartShuffle ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/50" : "text-gray-300 hover:bg-white/10 hover:text-white"}`}><FiShuffle /> Smart Shuffle {smartShuffle ? "On" : "Off"}</button>
              <button type="button" disabled={!isOwner || isLiked} onClick={() => setShowCollaborator(true)} title={isLiked ? "Dynamic collections cannot have collaborators" : isOwner ? "Add collaborator" : "Only the owner can invite collaborators"} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><FiUserPlus /> <span className="hidden sm:inline">Add collaborator</span></button>
              <button type="button" aria-label="Search in playlist" title="Search in playlist" aria-expanded={showSearch} onClick={() => setShowSearch((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white"><FiSearch /> <span className="hidden sm:inline">Search in playlist</span></button>
              <div className="relative ml-auto">
                <button type="button" aria-label="Playlist options" title="Playlist options" aria-expanded={showOptions} disabled={!isOwner || isLiked} onClick={() => setShowOptions((value) => !value)} className="grid h-10 w-10 place-items-center rounded-full text-xl text-gray-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><FiMoreHorizontal /></button>
                {showOptions && (
                  <div className="absolute right-0 top-12 z-20 w-56 rounded-md border border-white/10 bg-[#111d28] p-1.5 text-sm shadow-2xl">
                    <button type="button" disabled={saving} onClick={() => updateSetting("pinned", !collection.pinned)} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left hover:bg-white/10"><BsPinAngleFill /> {collection.pinned ? "Unpin from Library" : "Pin to Library"}</button>
                    <button type="button" disabled={saving} onClick={() => updateSetting("visibility", collection.visibility === "public" ? "private" : "public")} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left hover:bg-white/10">{collection.visibility === "public" ? <FiLock /> : <FiGlobe />} Make {collection.visibility === "public" ? "private" : "public"}</button>
                    <button type="button" disabled={saving} onClick={removePlaylist} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-red-300 hover:bg-red-400/10"><FiTrash2 /> Delete playlist</button>
                  </div>
                )}
              </div>
            </section>

            {showSearch && (
              <label className="relative mb-5 block max-w-md">
                <span className="sr-only">Search tracks in {title}</span>
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} onFocus={handleInputFocus} onBlur={handleInputBlur} placeholder="Search by title or artist" className="h-11 w-full rounded-md border border-white/10 bg-white/[0.07] pl-10 pr-10 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[#00e6e6]" />
                {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white"><FiX /></button>}
              </label>
            )}

            <section aria-label={`${title} tracks`}>
              <div className="grid grid-cols-[32px_minmax(0,1fr)_50px_36px] items-center gap-2 border-b border-white/10 px-2 pb-2 text-xs uppercase text-gray-400 md:grid-cols-[36px_minmax(180px,2fr)_minmax(100px,1fr)_60px_36px] lg:grid-cols-[42px_minmax(220px,2fr)_minmax(120px,1fr)_120px_70px_40px]">
                <span className="text-center">#</span><span>Title &amp; artist</span><span className="hidden md:block">Album</span><span className="hidden lg:block">Date added</span><FiClock className="mx-auto" /><span />
              </div>
              {filteredTracks.map((track, index) => (
                <div key={track.id} className={`group grid min-h-[66px] grid-cols-[32px_minmax(0,1fr)_50px_36px] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.075] md:grid-cols-[36px_minmax(180px,2fr)_minmax(100px,1fr)_60px_36px] lg:grid-cols-[42px_minmax(220px,2fr)_minmax(120px,1fr)_120px_70px_40px] ${youtubeVideo?.id === track.id ? "bg-white/[0.06]" : ""}`}>
                  <button type="button" aria-label={`Play ${cleanText(track.title)}`} onClick={() => playTrack(track)} className={`grid h-9 w-9 place-items-center rounded-full text-sm ${youtubeVideo?.id === track.id ? "text-[#00e6e6]" : "text-gray-400 group-hover:text-white"}`}><span className="group-hover:hidden">{index + 1}</span><FiPlay className="hidden fill-current group-hover:block" /></button>
                  <button type="button" onClick={() => playTrack(track)} className="flex min-w-0 items-center gap-3 text-left">
                    <img src={track.thumbnail} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
                    <span className="min-w-0"><span className={`block truncate text-sm font-semibold ${youtubeVideo?.id === track.id ? "text-[#00e6e6]" : "text-white"}`}>{cleanText(track.title)}</span><span className="mt-1 block truncate text-xs text-gray-400">{track.channel}</span></span>
                  </button>
                  <span className="hidden truncate text-xs text-gray-400 md:block">-</span>
                  <span className="hidden text-xs text-gray-400 lg:block">{formatAddedDate(track.addedAt)}</span>
                  <span className="text-right text-xs tabular-nums text-gray-400">{formatDuration(track.duration)}</span>
                  {(isLiked || canEditTracks) ? <button type="button" aria-label={isLiked ? `Remove ${cleanText(track.title)} from Liked Songs` : `Remove ${cleanText(track.title)} from playlist`} title={isLiked ? "Remove from Liked Songs" : "Remove from playlist"} onClick={() => removeTrack(track)} className="grid h-8 w-8 place-items-center rounded-full text-gray-500 opacity-100 hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover:opacity-100">{isLiked ? <FiHeart className="fill-current text-[#00e6e6]" /> : <FiTrash2 />}</button> : <span />}
                </div>
              ))}
              {tracks.length === 0 && <div className="py-16 text-center"><FiMusic className="mx-auto h-10 w-10 text-gray-500" /><h2 className="mt-4 text-lg font-bold">No tracks yet</h2><p className="mt-2 text-sm text-gray-400">Save music from Home or Search to build this collection.</p></div>}
              {tracks.length > 0 && filteredTracks.length === 0 && <div className="py-14 text-center"><FiSearch className="mx-auto h-8 w-8 text-gray-500" /><p className="mt-3 text-sm text-gray-400">No tracks match &quot;{search}&quot;.</p></div>}
            </section>
          </>
        )}
      </div>

      {showCollaborator && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 px-4" onClick={() => setShowCollaborator(false)}>
          <form onSubmit={addCollaborator} onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-lg border border-white/10 bg-[#0c1823] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Add a collaborator</h2><p className="mt-2 text-sm text-gray-400">They can add and remove tracks from this playlist.</p></div><button type="button" aria-label="Close" onClick={() => setShowCollaborator(false)} className="grid h-9 w-9 place-items-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white"><FiX /></button></div>
            <label className="mt-6 block text-xs font-semibold uppercase text-gray-400">Account email<input type="email" required value={collaboratorEmail} onChange={(event) => setCollaboratorEmail(event.target.value)} onFocus={handleInputFocus} onBlur={handleInputBlur} placeholder="listener@example.com" className="mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm normal-case text-white outline-none focus:border-[#00e6e6]" /></label>
            <button type="submit" disabled={saving} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-black disabled:opacity-50"><FiCheck /> {saving ? "Adding..." : "Add collaborator"}</button>
          </form>
        </div>
      )}
    </main>
  );
}