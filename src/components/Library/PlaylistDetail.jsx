"use client";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import PlaylistItemMenu from "@/components/PlaylistItemMenu";
import EditPlaylistDetails from "@/components/EditPlaylistDetails";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import {
  Check as FiCheck,
  Clock as FiClock,
  Globe as FiGlobe,
  Heart as FiHeart,
  Link as FiLink,
  Lock as FiLock,
  Ellipsis as FiMoreHorizontal,
  Music as FiMusic,
  Play as FiPlay,
  Pause as FiPause,
  Search as FiSearch,
  Sparkles as FiSparkles,
  Shuffle as FiShuffle,
  Trash2 as FiTrash2,
  UserPlus as FiUserPlus,
  X as FiX,
  Pin as BsPinAngleFill,
} from "lucide-react";

import { addFavourite } from "@/services/dataAPI";
import {
  deletePlaylist,
  deleteSongFromPlaylist,
  getSinglePlaylist,
  movePlaylistSong,
  updatePlaylist,
} from "@/services/playlistApi";
import {
  getFavouriteLibrary,
  hydratePlaylistTracks,
  hydrateYouTubeTracks,
  playlistTracksWithMetadata,
  validYouTubeIds,
  valueFromDateMap,
} from "@/services/libraryApi";
import {
  startYoutubePlayback,
  playPause,
  setQueueShuffle,
} from "@/redux/features/playerSlice";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import PlaylistCover from "@/components/PlaylistCover";
import LikePlaylistButton from "@/components/LikePlaylistButton";
import CoverUploader from "@/components/CoverUploader";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import AccessibleDialog from "@/components/AccessibleDialog";
import { PlaylistHeroSkeleton, SongRowsSkeleton } from "@/components/Skeleton";
import VirtualizedPlaylistTrackList from "@/components/Library/VirtualizedPlaylistTrackList";
import { requestJson } from "@/services/http";
import { PLAYLIST_CATEGORIES } from "@/utils/playlistThemes";
import { toUserError } from "@/utils/userError";
import { readNavCache, writeNavCache } from "@/utils/navCache";
import useAccountScope from "@/hooks/useAccountScope";
import { PLAYLISTS_CHANGED_EVENT, isCurrentPlaylistEvent, notifyPlaylistChanged } from "@/utils/playlistEvents.mjs";
import {
  readDiscoveryShufflePreference,
  writeDiscoveryShufflePreference,
} from "@/utils/discoveryShufflePreference.mjs";
import {
  playlistEmbedSnippet,
  playlistListenUrl,
} from "@/utils/shareCard.mjs";

import { playlistDurationLabel } from "@/utils/playlistDuration.mjs";

function interleaveRecommendations(tracks, recommendations) {
  if (recommendations.length === 0) return tracks;
  const userTracks = [...tracks];
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
    <div className={`grid place-items-center bg-gradient-to-br from-[#1399c6] via-[#096192] to-[#1171ba] ${className}`}>
      <FiHeart size="1em" className="h-16 w-16 fill-white text-white sm:h-20 sm:w-20" />
    </div>
  );
}

function AccessGate() {
  return (
    <main className="page text-white">
      <section className="flex flex-col items-start gap-6 rounded-2xl border border-white/10 bg-[#162943]/85 px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="flex gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-[#096192]"><FiLock size="1em" /></span>
          <div><h1 className="text-2xl font-bold">Liked Songs are yours to keep</h1><p className="mt-2 text-sm text-gray-300">Save your favorite tracks in one place. Log in or create a free account.</p></div>
        </div>
        <div className="flex gap-2"><Link href="/login" className="btn-primary h-10 px-5 text-sm">Log in</Link><Link href="/signup" className="btn-ghost h-10 px-5 text-sm">Sign up</Link></div>
      </section>
    </main>
  );
}

export default function PlaylistDetail({ kind, playlistId }) {
  const { data: session } = useSession();
  const scope = useAccountScope();
  return <AccountPlaylistDetail key={`${scope.key}:${kind}:${playlistId || ""}`} kind={kind} playlistId={playlistId} session={session} scope={scope} />;
}

function AccountPlaylistDetail({ kind, playlistId, session, scope }) {
  const { owner, status } = scope;
  const isLiked = kind === "liked";
  const router = useRouter();
  const dispatch = useDispatch();
  const activeTrack = useSelector((state) => state.player.youtubeVideo);
  const activeContext = useSelector((state) => state.player.playbackContext);
  const isPlaying = useSelector((state) => state.player.isPlaying);
  const shuffleEnabled = useSelector((state) => state.player.shuffleEnabled);
  const cacheKey = `${scope.key}:${isLiked ? "liked" : `playlist:${playlistId || ""}`}`;
  const [cached] = useState(() => readNavCache(cacheKey));
  const [collection, setCollection] = useState(() => cached?.collection ?? null);
  const [tracks, setTracks] = useState(() => cached?.tracks ?? []);
  const [editDetails, setEditDetails] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(() => !cached);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState("custom");
  const [showSearch, setShowSearch] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showCollaborator, setShowCollaborator] = useState(false);
  const [collaboratorEmail, setCollaboratorEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [discoveryShuffle, setSmartShuffle] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionError, setActionError] = useState(null);
  const collectionRef = useRef(collection);
  const tracksRef = useRef(tracks);
  const syncVersion = useRef(0);
  const mutating = useRef(false);
  const playTrackRef = useRef(null);
  const removeTrackRef = useRef(null);
  const moveTrackRef = useRef(null);
  const handleRowPlay = useCallback((track) => playTrackRef.current?.(track), []);
  const handleRowRemove = useCallback((track) => removeTrackRef.current?.(track), []);
  const handleRowMove = useCallback((entryId, beforeEntryId) => moveTrackRef.current?.(entryId, beforeEntryId), []);

  // Commit canonical order first. Catalog lookup is separate, so a failed details
  // request leaves saved rows/counts and removal/reordering available for retry.
  const applyCollection = useCallback((nextCollection) => {
    if (!scope.isCurrentView() || !nextCollection) return;
    const current = collectionRef.current;
    if (!isLiked && Number.isSafeInteger(current?.revision)
      && Number.isSafeInteger(nextCollection.revision) && nextCollection.revision < current.revision) return;
    const next = { ...current, ...nextCollection };
    const token = ++syncVersion.current;
    const metadata = tracksRef.current;
    const initialTracks = isLiked
      ? validYouTubeIds(next.favourites).reverse().map(id => ({
        ...(metadata.find(track => track.id === id && !track.metadataPending) || {
          title: "Song details unavailable", channel: "", thumbnail: "",
          unavailable: true, metadataPending: true, unavailableReason: "Retry loading song details",
        }), id, duration: metadata.find(track => track.id === id)?.duration || next.favouriteDurations?.[id] || 0,
        addedAt: valueFromDateMap(next.favouriteAddedAt, id),
      }))
      : playlistTracksWithMetadata(next, metadata);
    collectionRef.current = next;
    tracksRef.current = initialTracks;
    setCollection(next);
    setTracks(initialTracks);
    setLoading(false);
    setError(null);
    setMetadataError(null);
    setMetadataLoading(initialTracks.length > 0);
    if (!isLiked) setSmartShuffle(Boolean(next.smartShuffle));
    writeNavCache(cacheKey, { collection: next, tracks: initialTracks });
    if (!initialTracks.length) return;
    const hydrate = isLiked
      ? hydrateYouTubeTracks(initialTracks.map(track => track.id), { retainUnavailable: true, durations: next.favouriteDurations })
        .then(items => items.map(track => ({ ...track, addedAt: valueFromDateMap(next.favouriteAddedAt, track.id) })))
      : hydratePlaylistTracks(next);
    hydrate.then(items => {
      if (!scope.isCurrentView() || token !== syncVersion.current) return;
      tracksRef.current = items;
      setTracks(items);
      writeNavCache(cacheKey, { collection: next, tracks: items });
    }).catch(failure => {
      if (!scope.isCurrentView() || token !== syncVersion.current) return;
      setMetadataError(toUserError(failure, { title: "Song details unavailable", message: "Your saved songs are still here. Retry to load their details and playback controls." }));
    }).finally(() => {
      if (scope.isCurrentView() && token === syncVersion.current) setMetadataLoading(false);
    });
  }, [cacheKey, isLiked, scope]);

  useEffect(() => {
    if (status === "loading" || (isLiked && status !== "authenticated")
      || (status === "authenticated" && !scope.isCurrent())) {
      setLoading(status === "loading");
      return undefined;
    }
    let active = true;
    const token = ++syncVersion.current;
    if (!collectionRef.current) setLoading(true);
    setError(null);
    (async () => {
      try {
        const source = isLiked ? await getFavouriteLibrary() : await getSinglePlaylist(playlistId);
        if (!isLiked && !source?.success) throw source;
        const next = isLiked ? source : source.data;
        if (!next || typeof next !== "object") throw new Error("Invalid playlist response");
        if (active && scope.isCurrentView() && token === syncVersion.current) applyCollection(next);
      } catch (failure) {
        if (active && scope.isCurrentView() && token === syncVersion.current) {
          setError(toUserError(failure, { title: isLiked ? "Liked Songs unavailable" : "Playlist unavailable",
            message: "We couldn’t load this collection. Please try again." }));
        }
      } finally {
        if (active && scope.isCurrentView()) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [applyCollection, isLiked, playlistId, refreshKey, scope, status]);

  useEffect(() => {
    const changed = event => {
      if (!isCurrentPlaylistEvent(event, scope)) return;
      if (event.detail?.deletedId === playlistId) { router.replace("/library"); return; }
      if (!isLiked && String(event.detail?.playlist?._id) === String(playlistId)) applyCollection(event.detail.playlist);
      else if (!event.detail?.playlist && !event.detail?.deletedId) setRefreshKey(value => value + 1);
    };
    const favourites = event => {
      if (isLiked && scope.isCurrent() && (!event.accountOwner || event.accountOwner === owner)) setRefreshKey(value => value + 1);
    };
    window.addEventListener(PLAYLISTS_CHANGED_EVENT, changed);
    window.addEventListener("favourites-changed", favourites);
    return () => {
      window.removeEventListener(PLAYLISTS_CHANGED_EVENT, changed);
      window.removeEventListener("favourites-changed", favourites);
    };
  }, [applyCollection, isLiked, owner, playlistId, router, scope]);

  useEffect(() => {
    if (isLiked) setSmartShuffle(readDiscoveryShufflePreference(window.localStorage));
  }, [isLiked]);

  // Discovery is optional. A late response must never start playback or undo a
  // user's Pause; queue construction below is entirely synchronous.
  useEffect(() => {
    if (!discoveryShuffle) return undefined;
    let active = true;
    const controller = new AbortController();
    requestJson("/api/recommendations", { signal: controller.signal,
      fallbackTitle: "Recommendations unavailable", fallbackMessage: "Discovery songs couldn’t be loaded." })
      .then(data => {
        if (!active || !scope.isCurrentView()) return;
        setRecommendations([...(data?.sections?.trending || []), ...(data?.sections?.charts || []), ...(data?.sections?.newReleases || [])]);
      }).catch(() => { /* Discovery failure never blocks the saved playlist. */ });
    return () => { active = false; controller.abort(); };
  }, [discoveryShuffle, scope]);

  const ownerId = collection?.user?._id || collection?.user;
  const isOwner = status === "authenticated" && (isLiked || String(ownerId) === String(session?.user?.id));
  const isCollaborator = status === "authenticated" && !isLiked && collection?.collaborators?.some(
    user => String(user?._id || user) === String(session?.user?.id));
  const canEditTracks = isOwner || isCollaborator;
  const ownerName = isLiked ? session?.user?.name || "You" : collection?.user?.userName || "HayKasa listener";
  const ownerImage = isLiked ? session?.user?.image : collection?.user?.imageUrl;
  const title = isLiked ? "Liked Songs" : collection?.name || "Playlist";
  const typeLabel = isLiked ? "Playlist" : `${collection?.visibility === "public" ? "Public" : "Private"} playlist`;
  const contextId = isLiked ? "liked" : String(playlistId || collection?._id || "");
  const contextActive = activeContext?.type === (isLiked ? "liked" : "playlist") && activeContext?.id === contextId;
  const activeEntryId = contextActive ? activeTrack?.playlistEntryId : "";
  const currentInCollection = contextActive && tracks.some(track => activeEntryId
    ? track.playlistEntryId === activeEntryId : track.id === activeTrack?.id);
  const canReorder = !isLiked && canEditTracks && sort === "custom" && !search.trim() && !saving;

  const sortedTracks = useMemo(() => {
    if (sort === "custom") return tracks;
    return [...tracks].sort((a, b) => {
      if (sort === "title" || sort === "artist") return String(a[sort === "title" ? "title" : "channel"] || "").localeCompare(String(b[sort === "title" ? "title" : "channel"] || ""));
      if (sort === "duration") return (Number(a.duration) || Infinity) - (Number(b.duration) || Infinity);
      return (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0);
    });
  }, [sort, tracks]);
  const filteredTracks = useMemo(() => {
    const query = deferredSearch.trim().toLocaleLowerCase();
    return query ? sortedTracks.filter(track => `${track.title} ${track.channel}`.toLocaleLowerCase().includes(query)) : sortedTracks;
  }, [deferredSearch, sortedTracks]);
  const totalDuration = useMemo(() => playlistDurationLabel(tracks), [tracks]);

  const createQueue = () => {
    const playable = sortedTracks.filter(track => !track.unavailable && track.playable !== false);
    const queue = discoveryShuffle ? interleaveRecommendations(playable, recommendations.filter(track => track?.id && !track.unavailable && track.playable !== false)) : playable;
    return queue.map(item => ({ ...item, seedQuery: item.seedQuery || item.genre || title, genre: item.genre || title }));
  };
  const playTrack = track => {
    if (!scope.isCurrentView() || (status === "authenticated" && !scope.isCurrent()) || track.unavailable || track.playable === false) return;
    const same = currentInCollection && (track.playlistEntryId
      ? track.playlistEntryId === activeEntryId : track.id === activeTrack?.id);
    if (same) { dispatch(playPause(!isPlaying)); return; }
    const queue = createQueue();
    const index = queue.findIndex(item => track.playlistEntryId ? item.playlistEntryId === track.playlistEntryId : item.id === track.id);
    if (index < 0) return;
    dispatch(startYoutubePlayback({ queue, index, track: queue[index], queueMode: "collection", autoExtend: false,
      context: { type: isLiked ? "liked" : "playlist", id: contextId, name: title } }));
  };
  playTrackRef.current = playTrack;
  const playCollection = () => {
    if (!scope.isCurrentView() || (status === "authenticated" && !scope.isCurrent())) return;
    if (currentInCollection) { dispatch(playPause(!isPlaying)); return; }
    const queue = createQueue();
    if (!queue.length) return;
    const index = shuffleEnabled ? Math.floor(Math.random() * queue.length) : 0;
    dispatch(startYoutubePlayback({ queue, index, track: queue[index], queueMode: "collection", autoExtend: false,
      context: { type: isLiked ? "liked" : "playlist", id: contextId, name: title } }));
  };

  const reportMutationError = (failure, fallback) => {
    if (!scope.isCurrent()) return;
    const normalized = toUserError(failure);
    const userError = normalized.code === "UNAUTHORIZED" ? normalized : toUserError(failure, fallback);
    setActionError(userError);
    toast.error(userError.message);
    if (normalized.code === "CONFLICT") setRefreshKey(value => value + 1);
  };
  const acceptMutation = playlist => {
    if (!scope.isCurrent() || !playlist) return;
    if (!notifyPlaylistChanged({ owner, playlist })) applyCollection(playlist);
  };
  const mutate = async (request, onSuccess, fallback) => {
    if (!scope.isCurrent() || mutating.current) return;
    mutating.current = true;
    setSaving(true);
    setActionError(null);
    try {
      const response = await request();
      if (!scope.isCurrent()) return;
      if (!response?.success) throw response;
      onSuccess(response);
    } catch (failure) {
      reportMutationError(failure, fallback);
    } finally {
      mutating.current = false;
      if (scope.isCurrent()) setSaving(false);
    }
  };
  const copyShare = async (value, success) => {
    try {
      await navigator.clipboard.writeText(value);
      if (scope.isCurrentView()) toast.success(success);
    } catch { if (scope.isCurrentView()) toast.error("Couldn’t copy that"); }
  };
  const isPublicPlaylist = !isLiked && collection?.visibility === "public";
  const updateSetting = (action, value) => mutate(() => updatePlaylist(playlistId, action, value), response => {
    acceptMutation(response.data?.playlist);
    toast.success("Playlist updated");
    if (action !== "cover" && action !== "category") setShowOptions(false);
  }, { title: "Playlist not updated", message: "We couldn’t update that playlist. Please try again." });
  const toggleDiscoveryShuffle = () => {
    const next = !discoveryShuffle;
    if (!scope.isCurrentView()) return;
    if (!isLiked && isOwner) { void updateSetting("smartShuffle", next); return; }
    setSmartShuffle(next);
    if (isLiked && scope.isCurrent()) writeDiscoveryShufflePreference(window.localStorage, next);
  };
  const addCollaborator = event => {
    event.preventDefault();
    if (!collaboratorEmail.trim()) return;
    void mutate(() => updatePlaylist(playlistId, "addCollaborator", collaboratorEmail), response => {
      acceptMutation(response.data?.playlist);
      setCollaboratorEmail(""); setShowCollaborator(false);
      toast.success("If they have a HayKasa account, they now have access.");
    }, { title: "Collaborator not added", message: "We couldn’t add that collaborator. Please try again." });
  };
  const removeTrack = track => mutate(() => isLiked
    ? addFavourite({ id: track.id, liked: false })
    : deleteSongFromPlaylist(playlistId, track.id, { entryId: track.playlistEntryId, expectedRevision: collectionRef.current?.revision }), response => {
    if (isLiked) {
      const favourites = Array.isArray(response.data?.favourites) ? response.data.favourites : collectionRef.current.favourites.filter(id => id !== track.id);
      applyCollection({ ...collectionRef.current, ...response.data, favourites });
      window.dispatchEvent(Object.assign(new CustomEvent("favourites-changed", { detail: favourites }), { accountOwner: owner }));
    } else if (response.playlist) acceptMutation(response.playlist);
    else setRefreshKey(value => value + 1);
    toast.success(isLiked ? "Removed from Liked Songs" : "Song removed from playlist");
  }, { title: "Song not removed", message: "We couldn’t remove that song. Please try again." });
  removeTrackRef.current = removeTrack;
  const moveTrack = (entryId, beforeEntryId) => {
    if (!canReorder || !entryId || entryId === beforeEntryId) return;
    void mutate(() => movePlaylistSong(playlistId, entryId, beforeEntryId, collectionRef.current?.revision), response => {
      acceptMutation(response.data?.playlist);
      toast.success("Playlist order saved");
    }, { title: "Order not saved", message: "The playlist may have changed. Refresh it and try again." });
  };
  moveTrackRef.current = moveTrack;
  const removePlaylist = () => {
    if (!scope.isCurrent() || !window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    void mutate(() => deletePlaylist(playlistId), () => {
      notifyPlaylistChanged({ owner, deletedId: playlistId });
      toast.success("Playlist deleted"); router.push("/library");
    }, { title: "Playlist not deleted", message: "We couldn’t delete that playlist. Please try again." });
  };

  const handleInputFocus = () => dispatch(setIsTyping(true));
  const handleInputBlur = () => dispatch(setIsTyping(false));

  if (!loading && isLiked && status === "unauthenticated") return <AccessGate />;

  return (
    <main className={`page-collection text-white ${isLiked ? "is-liked-collection" : ""}`}>
      {editDetails && isOwner && !isLiked && collection && <EditPlaylistDetails playlist={collection} onClose={() => setEditDetails(false)} onSaved={applyCollection} />}
      {!error && collection ? (
        <ContextMenuTarget as="section" className="collection-hero px-[3vw] pb-8 pt-8">
          <div className="collection-hero-content mx-auto flex w-full max-w-[1440px] flex-col gap-6">
            {isLiked ? (
              <LikedCover className="collection-artwork aspect-square w-48 shrink-0 rounded-[4px] shadow-2xl sm:w-52 lg:w-60" />
            ) : (
              <div className="collection-artwork aspect-square w-48 shrink-0 rounded-[4px] shadow-2xl sm:w-52 lg:w-60"><PlaylistCover
                playlist={{
                  ...collection,
                  cover: tracks[0]?.thumbnail,
                }}
                className="h-full w-full rounded-[4px]"
              /></div>
            )}
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-xs font-bold uppercase text-white/80">{typeLabel}</p>
              <h1 className="collection-title mt-3 break-words font-bold">{isOwner && !isLiked ? <button type="button" onClick={() => setEditDetails(true)} title="Edit playlist details" className="max-w-full text-left [overflow-wrap:anywhere] hover:underline">{title}</button> : title}</h1>
              {!isLiked && collection.description && <p className="mt-4 max-w-2xl break-words whitespace-pre-wrap text-sm leading-6 text-white/70">{collection.description}</p>}
              <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-gray-200">
                {ownerImage ? <img src={ownerImage} alt="" onError={(event) => { event.currentTarget.hidden = true; }} className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10"><FiMusic size="1em" /></span>}
                <strong className="text-white">{ownerName}</strong>
                <span>&bull;</span>
                <span>{tracks.length.toLocaleString()} {tracks.length === 1 ? "song" : "songs"}{tracks.length > 0 ? `, ${totalDuration}` : ""}</span>
                {!isLiked && collection.collaborators?.length > 0 && <><span>&bull;</span><span>{collection.collaborators.length} collaborator{collection.collaborators.length === 1 ? "" : "s"}</span></>}
              </div>
            </div>
          </div>
          {!isLiked && collection && <PlaylistItemMenu playlist={collection} onChanged={applyCollection} onDeleted={() => router.push("/library")} />}
        </ContextMenuTarget>
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
            {metadataError && <div className="pt-6"><UserMessage compact title={metadataError.title} message={metadataError.message} onRetry={() => applyCollection(collectionRef.current)} /></div>}
            {metadataLoading && <p role="status" className="pt-4 text-sm text-[var(--muted)]">Loading song details…</p>}
            <section className="flex flex-wrap items-center gap-2 py-6" aria-label="Playlist actions">
              <button type="button" aria-label={`${currentInCollection && isPlaying ? "Pause" : "Play"} ${title}`} onClick={playCollection} disabled={!currentInCollection && !tracks.some(track => !track.unavailable && track.playable !== false)} className="play-fab play-fab--static mr-2 h-14 w-14 min-h-14 min-w-14 disabled:cursor-not-allowed disabled:opacity-40">{currentInCollection && isPlaying ? <FiPause size="1em" fill="currentColor" /> : <FiPlay size="1em" fill="currentColor" className="ml-1 fill-current" />}</button>
              <button type="button" aria-label="Shuffle" title="Shuffle saved songs" aria-pressed={Boolean(shuffleEnabled)} onClick={() => { if (scope.isCurrentView()) dispatch(setQueueShuffle(!shuffleEnabled)); }} className={`grid h-11 w-11 place-items-center rounded-full text-2xl hover:bg-white/10 ${shuffleEnabled ? "text-[var(--accent)] ring-1 ring-[var(--accent)]" : "text-gray-300"}`}><FiShuffle size="1em" aria-hidden="true" /></button>
              <button type="button" aria-label="Discovery" title="Include recommended songs between saved songs" aria-pressed={discoveryShuffle} disabled={saving} onClick={toggleDiscoveryShuffle} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-semibold hover:bg-white/10 disabled:opacity-50 ${discoveryShuffle ? "text-[var(--accent)] ring-1 ring-[var(--accent)]" : "text-gray-300"}`}><FiSparkles size="1em" aria-hidden="true" /><span>Discovery</span></button>
              {!isLiked && collection ? <LikePlaylistButton playlist={collection} onChange={next => applyCollection({ ...collectionRef.current, ...next })} /> : null}
              {isPublicPlaylist ? (
                <>
                  <button
                    type="button"
                    onClick={() => copyShare(playlistListenUrl(playlistId), "Playlist link copied")}
                    className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white"
                  >
                    <FiLink size="1em" /> <span className="hidden sm:inline">Copy link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => copyShare(playlistEmbedSnippet(playlistId), "Embed code copied")}
                    className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white"
                  >
                    <FiGlobe size="1em" /> <span className="hidden sm:inline">Copy embed</span>
                  </button>
                </>
              ) : null}
              {isOwner && !isLiked && <button type="button" onClick={() => setShowCollaborator(true)} title="Add collaborator" className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><FiUserPlus size="1em" /> <span className="hidden sm:inline">Add collaborator</span></button>}
              <button type="button" aria-label="Search in playlist" title="Search in playlist" aria-expanded={showSearch} onClick={() => { setShowSearch(value => !value); if (showSearch) setSearch(""); }} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white"><FiSearch size="1em" /> <span className="hidden sm:inline">Search in playlist</span></button>
              <label className="ml-auto text-xs text-[var(--muted)]"><span className="sr-only">Sort playlist</span><select aria-label="Sort playlist" value={sort} onChange={event => setSort(event.target.value)} className="min-h-11 max-w-full rounded-md border border-white/10 bg-[var(--navy-raised)] px-3 text-sm text-white"><option value="custom">{isLiked ? "Recently added" : "Custom order"}</option><option value="title">Title</option><option value="artist">Artist</option>{!isLiked && <option value="added">Recently added</option>}<option value="duration">Duration</option></select></label>
              {isOwner && !isLiked && <div className="relative flex items-center">
                <button type="button" aria-label="Playlist options" title="Playlist options" aria-expanded={showOptions} disabled={!isOwner || isLiked} onClick={() => setShowOptions((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full text-xl text-gray-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><FiMoreHorizontal size="1em" /></button>
                {showOptions && collection && (
                  <AccessibleDialog open onClose={() => setShowOptions(false)} titleId="playlist-options-title" panelClassName="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-lg border border-white/10 bg-[var(--navy-raised)] p-3 text-sm shadow-2xl">
                    <div className="flex items-center justify-between gap-3 px-3"><h2 id="playlist-options-title" className="text-lg font-bold">Playlist options</h2><button type="button" aria-label="Close playlist options" onClick={() => setShowOptions(false)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10"><FiX size="1em" /></button></div>
                    <button type="button" onClick={() => { setShowOptions(false); setEditDetails(true); }} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left hover:bg-white/10">Edit details</button>
                    <button type="button" disabled={saving} onClick={() => updateSetting("pinned", !collection.pinned)} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left hover:bg-white/10"><BsPinAngleFill size="1em" fill="currentColor" /> {collection.pinned ? "Unpin from Library" : "Pin to Library"}</button>
                    <button type="button" disabled={saving} onClick={() => updateSetting("visibility", collection.visibility === "public" ? "private" : "public")} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left hover:bg-white/10">{collection.visibility === "public" ? <FiLock size="1em" /> : <FiGlobe size="1em" />} Make {collection.visibility === "public" ? "private" : "public"}</button>
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
                    <button type="button" disabled={saving} onClick={removePlaylist} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-red-300 hover:bg-red-400/10"><FiTrash2 size="1em" /> Delete playlist</button>
                  </AccessibleDialog>
                )}
              </div>}
            </section>

            {showSearch && (
              <label className="relative mb-5 block max-w-md">
                <span className="sr-only">Search tracks in {title}</span>
                <FiSearch size="1em" aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} onFocus={handleInputFocus} onBlur={handleInputBlur} placeholder="Search by title or artist" className="h-11 w-full rounded-md border border-white/10 bg-white/[0.07] pl-10 pr-10 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[#096192]" />
                {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white"><FiX size="1em" aria-hidden="true" /></button>}
              </label>
            )}

            {!isLiked && canEditTracks && tracks.length > 1 && <p className="mb-3 text-xs text-[var(--muted)]">{canReorder ? "Drag songs or use Move up / Move down in a song’s menu to change the order." : "Choose Custom order and clear search to move songs."}</p>}
            <section className="collection-tracks" aria-label={`${title} tracks`} aria-busy={saving}>
              {tracks.length > 0 && <div className="playlist-track-heading grid items-center gap-2 border-b border-white/10 px-2 pb-2 text-xs uppercase text-gray-400">
                <span className="text-center">#</span><span>Title &amp; artist</span><span className="hidden md:block">Album</span><span className="hidden lg:block">Date added</span><span className="mx-auto hidden md:inline"><FiClock size="1em" aria-hidden="true" className="inline" /><span className="sr-only">Duration</span></span><span />
              </div>}
              <VirtualizedPlaylistTrackList
                tracks={filteredTracks}
                activeYoutubeId={contextActive ? activeTrack?.id : ""}
                activeEntryId={activeEntryId}
                isPlaying={isPlaying}
                removable={canEditTracks && !saving}
                liked={isLiked}
                reorderable={canReorder}
                onMove={handleRowMove}
                onPlay={handleRowPlay}
                onRemove={handleRowRemove}
                scrollKey={`${scope.key}:${isLiked ? "liked" : playlistId || collection?._id || "playlist"}`}
              />
              {tracks.length === 0 && (
                <div className="border-t border-white/10 py-10">
                  <h2 className="text-xl font-bold sm:text-2xl">{isLiked ? "Songs you like live here" : "Let’s find some songs for your playlist"}</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">{isLiked ? "Save songs with the heart button to keep them here." : "Find a song, then choose Add to playlist from its menu."}</p>
                  <Link href="/search" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-black hover:bg-gray-200"><FiSearch size="1em" aria-hidden="true" />Find songs</Link>
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
          panelClassName="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-white/10 bg-[var(--navy-raised)] p-6 shadow-2xl"
        >
          <form onSubmit={addCollaborator}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="collaborator-title" className="text-xl font-bold">Add a collaborator</h2>
                <p id="collaborator-description" className="mt-2 text-sm text-gray-400">They can add and remove tracks from this playlist.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setShowCollaborator(false)} className="grid h-11 w-11 place-items-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white">
                <FiX size="1em" aria-hidden="true" />
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
              className="mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm normal-case text-white outline-none focus:border-[#096192]"
            />
            <button type="submit" disabled={saving} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-black disabled:opacity-50">
              <FiCheck size="1em" aria-hidden="true" /> {saving ? "Adding..." : "Add collaborator"}
            </button>
          </form>
        </AccessibleDialog>
      )}
    </main>
  );
}

