"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { FiCheck, FiChevronDown, FiHeart, FiPlay, FiPlus, FiShuffle } from "react-icons/fi";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import toast from "react-hot-toast";
import MediaImage from "@/components/MediaImage";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { SongRowsSkeleton } from "@/components/Skeleton";
import ArtistNameLink from "@/components/ArtistNameLink";
import AddToQueueButton from "@/components/AddToQueueButton";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import ItemMenu from "@/components/ItemMenu";
import FavouriteTrackButton from "@/components/FavouriteTrackButton";
import { ArtistDiscography, ArtistPlaylistRail, ArtistVideoRail, RelatedArtistRail } from "@/components/ArtistCatalogRails";
import { getFavouriteLibrary, hydrateYouTubeTracks, validYouTubeIds } from "@/services/libraryApi";
import { musicReleaseHref, trackArtistCredits } from "@/utils/artistNavigation.mjs";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";
import { FOLLOWS_CHANGED_EVENT } from "@/utils/accountNotifications.mjs";
import { accountOwner } from "@/utils/accountCache.mjs";
import { isArtistFollowed } from "@/utils/followedArtistsList.mjs";
import styles from "./artistProfile.module.css";

function formatDuration(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0
    ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`
    : "—";
}

export default function ArtistProfile(props) {
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  return <AccountArtistProfile key={`${owner || status}:${props.artistId}`} {...props} status={status} owner={owner} />;
}

function AccountArtistProfile({ artistId, initialName = "", status, owner }) {
  const dispatch = useDispatch();
  const [artist, setArtist] = useState({ id: artistId, title: initialName, description: "", thumbnail: "" });
  const [tracks, setTracks] = useState([]);
  const [nextPageToken, setNextPageToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [followed, setFollowed] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followLoading, setFollowLoading] = useState(status === "authenticated");
  const [followError, setFollowError] = useState(null);
  const [followRetryKey, setFollowRetryKey] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [alsoPlay, setAlsoPlay] = useState([]);
  const [sections, setSections] = useState(null);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState(null);
  const [sectionsRetryKey, setSectionsRetryKey] = useState(0);
  const [expandedSongs, setExpandedSongs] = useState(false);
  const [savedTracks, setSavedTracks] = useState([]);
  const [likesLoading, setLikesLoading] = useState(status === "authenticated");
  const [likesError, setLikesError] = useState(null);
  const [likesRetryKey, setLikesRetryKey] = useState(0);
  const [collectionBusyId, setCollectionBusyId] = useState("");
  const [compactHeader, setCompactHeader] = useState(false);
  const heroRef = useRef(null);
  const collectionController = useRef(null);

  useEffect(() => () => collectionController.current?.abort(), []);

  useEffect(() => {
    const hero = heroRef.current;
    const root = document.getElementById("main-content");
    if (!hero || !root || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setCompactHeader(!entry.isIntersecting && entry.boundingClientRect.bottom <= entry.rootBounds?.top + 64);
    }, { root, rootMargin: "-64px 0px 0px", threshold: 0 });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setSectionsLoading(true);
    setSectionsError(null);
    requestJson(`/api/artist-sections?id=${encodeURIComponent(artistId)}`, {
      signal: controller.signal,
      fallbackTitle: "Artist catalog unavailable",
      fallbackMessage: "We couldn’t load the releases and playlists. You can still play the songs below.",
    }).then(data => {
      if (controller.signal.aborted) return;
      if (data?.artist?.id !== artistId) throw new Error("Artist catalog did not match this channel.");
      setSections(data);
    }).catch(failure => {
      if (!controller.signal.aborted) setSectionsError(toUserError(failure, { title: "Artist catalog unavailable", message: "We couldn’t load the releases and playlists. You can still play the songs below." }));
    }).finally(() => { if (!controller.signal.aborted) setSectionsLoading(false); });
    return () => controller.abort();
  }, [artistId, sectionsRetryKey]);

  useEffect(() => {
    if (status !== "authenticated" || !owner) return undefined;
    let cancelled = false;
    let generation = 0;
    const load = async (incomingIds) => {
      const requestGeneration = ++generation;
      setLikesLoading(true);
      setLikesError(null);
      try {
        const ids = validYouTubeIds(Array.isArray(incomingIds) ? incomingIds : (await getFavouriteLibrary()).favourites);
        const saved = [];
        // Limit hydration fan-out while still counting the complete saved library.
        for (let index = 0; index < ids.length; index += 200) {
          if (cancelled || requestGeneration !== generation) return;
          saved.push(...await hydrateYouTubeTracks(ids.slice(index, index + 200)));
        }
        if (cancelled || requestGeneration !== generation) return;
        setSavedTracks(saved);
      } catch (failure) {
        if (!cancelled && requestGeneration === generation) setLikesError(toUserError(failure, { title: "Liked Songs unavailable", message: "We couldn’t load the songs you liked by this artist." }));
      } finally {
        if (!cancelled && requestGeneration === generation) setLikesLoading(false);
      }
    };
    const refresh = (event) => {
      if (event?.accountOwner && event.accountOwner !== owner) return;
      // Legacy player events have no account tag. Re-read the current account
      // before accepting their IDs, while tagged events can update immediately.
      void load(event?.accountOwner === owner ? event.detail : undefined);
    };
    void load();
    window.addEventListener("favourites-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; generation += 1; window.removeEventListener("favourites-changed", refresh); window.removeEventListener("focus", refresh); };
  }, [artistId, likesRetryKey, owner, status]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ id: artistId });
        if (initialName) params.set("name", initialName);
        const data = await requestJson(`/api/youtube-channel?${params}`, {
          signal: controller.signal,
          fallbackTitle: "Artist unavailable",
          fallbackMessage: "We couldn’t load this artist. Please try again.",
        });
        if (cancelled) return;
        if (data?.artist) setArtist(data.artist);
        setTracks(Array.isArray(data?.tracks) ? data.tracks : []);
        setNextPageToken(typeof data?.nextPageToken === "string" ? data.nextPageToken : "");
      } catch (loadError) {
        if (!cancelled && !controller.signal.aborted) {
          setTracks([]);
          setError(toUserError(loadError, { title: "Artist unavailable", message: "We couldn’t load this artist. Please try again." }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [artistId, initialName, retryKey]);

  const seedKey = tracks.slice(0, 3).map((track) => track.id).filter(Boolean).join(",");

  useEffect(() => {
    if (!artistId || !seedKey) {
      setAlsoPlay([]);
      return undefined;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ id: artistId });
    if (artist.title || initialName) params.set("name", artist.title || initialName);
    seedKey.split(",").forEach((id) => params.append("video", id));
    requestJson(`/api/channel-rabbit-hole?${params}`, {
      signal: controller.signal,
      fallbackTitle: "Related songs unavailable",
      fallbackMessage: "We couldn’t load songs people also play.",
    }).then((data) => {
      setAlsoPlay(Array.isArray(data?.tracks) ? data.tracks : []);
    }).catch(() => {
      if (!controller.signal.aborted) setAlsoPlay([]);
    });
    return () => controller.abort();
  }, [artist.title, artistId, initialName, seedKey]);

  useEffect(() => {
    if (status !== "authenticated" || !artist.title) return undefined;
    const controller = new AbortController();
    setFollowLoading(true);
    setFollowError(null);
    requestJson("/api/followedArtists", {
      signal: controller.signal,
      fallbackTitle: "Follow status unavailable",
      fallbackMessage: "You can still play this artist.",
    }).then(json => {
      if (controller.signal.aborted) return;
      if (json?.success !== true || !Array.isArray(json.data)) throw new Error("Follow status did not return usable data.");
      setFollowed(isArtistFollowed({ followedArtists: json.data, followedArtistsMeta: json.artists }, { name: artist.title, channelId: artist.id || artistId }));
    }).catch(loadError => {
      if (!controller.signal.aborted) setFollowError(toUserError(loadError, { title: "Follow status unavailable", message: "We couldn’t load your follow status. Try again." }));
    }).finally(() => { if (!controller.signal.aborted) setFollowLoading(false); });
    return () => controller.abort();
  }, [artist.id, artist.title, artistId, followRetryKey, status]);

  useEffect(() => {
    const refresh = () => setFollowRetryKey(value => value + 1);
    window.addEventListener(FOLLOWS_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener(FOLLOWS_CHANGED_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, []);

  const title = artist.title || initialName || "Artist";
  const displayTitle = cleanTitle(title, "Artist");
  const playbackContext = { type: "artist", id: String(artist.id || artistId), name: title };
  const alsoPlayVisible = alsoPlay.filter((video) => video?.id && !tracks.some((track) => track.id === video.id));
  const popularTracks = Array.isArray(sections?.popularTracks) ? sections.popularTracks : [];
  const releases = (Array.isArray(sections?.releases) ? sections.releases : []).filter(release => musicReleaseHref(release?.id));
  const playlists = Array.isArray(sections?.playlists) ? sections.playlists : [];
  const musicVideos = Array.isArray(sections?.musicVideos) ? sections.musicVideos : [];
  const relatedArtists = Array.isArray(sections?.relatedArtists) ? sections.relatedArtists : [];
  const byThisArtist = track => trackArtistCredits(track).some(credit => credit.channelId === artistId);
  const knownArtistTracks = new Map([...tracks, ...popularTracks, ...musicVideos].filter(byThisArtist).map(track => [track.id, track]));
  const likedTracks = savedTracks.flatMap(track => {
    const known = knownArtistTracks.get(track.id);
    // Video details identify the uploader; Music shelves identify the artist.
    // Preserve those authoritative credits when a label uploaded the recording.
    return known ? [{ ...track, artists: trackArtistCredits(known), title: known.title || track.title }] : byThisArtist(track) ? [track] : [];
  });
  const artistWatchMore = alsoPlayVisible.filter(byThisArtist);
  const moreToExplore = alsoPlayVisible.filter(track => !byThisArtist(track));
  const sectionArtist = sections?.artist?.id === artistId ? sections.artist : null;
  const banner = artist.banner || sectionArtist?.banner || "";
  const biography = artist.description || sectionArtist?.description || "";
  const primaryTracks = popularTracks.length ? popularTracks : tracks;
  const playableTracks = tracks.length ? tracks : popularTracks;
  const visibleTracks = expandedSongs ? primaryTracks : primaryTracks.slice(0, 5);
  const latestRelease = releases.reduce((latest, release) => !latest || Number(release.year) > Number(latest.year) ? release : latest, null);

  const playTrack = (video, list = tracks) => {
    const queue = list.map((item) => ({
      ...item,
      seedQuery: item.seedQuery || artist.title,
      genre: item.genre || artist.title,
    }));
    const selected = queue.find((item) => item.id === video.id) || {
      ...video,
      seedQuery: video.seedQuery || artist.title,
      genre: video.genre || artist.title,
    };
    dispatch(startYoutubePlayback({
      queue,
      track: selected,
      queueMode: "collection",
      autoExtend: false,
      context: playbackContext,
    }));
  };

  const playAll = () => { if (playableTracks[0]) playTrack(playableTracks[0], playableTracks); };

  const shuffle = () => {
    const shuffled = [...playableTracks];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    if (shuffled[0]) playTrack(shuffled[0], shuffled);
  };

  const playCollection = async (collection, kind) => {
    if (collectionBusyId) return;
    const controller = new AbortController();
    collectionController.current = controller;
    setCollectionBusyId(collection.id);
    try {
      const data = await requestJson(`/api/youtube-${kind}?id=${encodeURIComponent(collection.id)}`, {
        signal: controller.signal,
        fallbackTitle: "Collection unavailable",
        fallbackMessage: "We couldn’t load the songs in this collection. Please try again.",
      });
      if (controller.signal.aborted || !mounted.current) return;
      const queue = Array.isArray(data?.tracks) ? data.tracks.filter(track => track?.id && !track.unavailable).map(track => ({ ...track, seedQuery: track.seedQuery || displayTitle, genre: track.genre || displayTitle })) : [];
      if (!queue.length) throw new Error("There are no playable songs in this collection.");
      dispatch(startYoutubePlayback({ queue, track: queue[0], queueMode: "collection", autoExtend: false, context: { type: kind, id: String(collection.id), name: collection.title || "Collection" } }));
    } catch (failure) {
      if (!controller.signal.aborted && mounted.current) toast.error(toUserError(failure, { title: "Collection unavailable", message: "We couldn’t load the songs in this collection. Please try again." }).message);
    } finally {
      if (!controller.signal.aborted && mounted.current) setCollectionBusyId("");
    }
  };

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ id: artistId, pageToken: nextPageToken });
      if (initialName || artist.title) params.set("name", initialName || artist.title);
      const data = await requestJson(`/api/youtube-channel?${params}`, {
        fallbackTitle: "More songs unavailable",
        fallbackMessage: "We couldn’t load more songs. Please try again.",
      });
      const extra = Array.isArray(data?.tracks) ? data.tracks : [];
      if (!mounted.current) return;
      setExpandedSongs(true);
      setTracks((current) => {
        const seen = new Set(current.map((track) => track.id));
        return [...current, ...extra.filter((track) => track?.id && !seen.has(track.id))];
      });
      setNextPageToken(typeof data?.nextPageToken === "string" ? data.nextPageToken : "");
    } catch (loadError) {
      if (mounted.current) toast.error(toUserError(loadError, { title: "More songs unavailable", message: "We couldn’t load more songs. Please try again." }).message);
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  };

  const toggleFollow = async () => {
    if (status !== "authenticated" || !artist.title || followBusy || followLoading || followError) return;
    const next = !followed;
    setFollowBusy(true);
    setFollowed(next);
    try {
      const data = await requestJson("/api/followedArtists", {
        method: "POST",
        body: { name: artist.title, channelId: artist.id || artistId, thumbnail: artist.thumbnail, followed: next },
        fallbackTitle: "Follow couldn’t be updated",
        fallbackMessage: "Your follow change wasn’t saved. Please try again.",
      });
      if (!mounted.current) return;
      if (data?.success !== true || !Array.isArray(data.data)) throw new Error("Follow update did not return usable data.");
      setFollowed(isArtistFollowed({ followedArtists: data.data, followedArtistsMeta: data.artists }, { name: artist.title, channelId: artist.id || artistId }));
      window.dispatchEvent(new Event(FOLLOWS_CHANGED_EVENT));
      toast.success(next ? "Followed" : "Unfollowed");
    } catch (followError) {
      if (!mounted.current) return;
      setFollowed(!next);
      toast.error(toUserError(followError).message);
    } finally {
      if (mounted.current) setFollowBusy(false);
    }
  };

  const songs = (list, queue = list) => <ol className={styles.songList}>{list.map((video, index) => <ContextMenuTarget as="li" key={video.id} className={styles.songRow}>
    <button type="button" aria-label={`Play ${cleanTitle(video.title)}`} onClick={() => playTrack(video, queue)} className={styles.rowPlay}><span className={styles.rowIndex}>{index + 1}</span><FiPlay className={styles.rowPlayIcon} aria-hidden="true" /></button>
    <div className={styles.songIdentity}>
      <MediaImage src={video.thumbnail} size="mq" alt="" width={44} height={44} className={styles.songArt} />
      <div className={styles.songCopy}>
        <button type="button" onClick={() => playTrack(video, queue)} className={styles.songTitle}>{cleanTitle(video.title, "Untitled track")}</button>
        <ArtistNameLink track={video} className={styles.credits} />
        <span className={styles.mobileDuration}>{formatDuration(video.duration)}</span>
      </div>
    </div>
    <div className={styles.rowFavourite}>{status === "authenticated" && <FavouriteTrackButton track={video} className={styles.favouriteButton} />}</div>
    <span className={`${styles.duration} ${styles.rowDuration}`} aria-label={`Duration: ${formatDuration(video.duration)}`}>{formatDuration(video.duration)}</span>
    <AddToQueueButton track={video} className={styles.queueButton} />
  </ContextMenuTarget>)}</ol>;

  const mainPlayDisabled = loading || Boolean(error) || !playableTracks.length;

  return <div className={`page ${styles.page}`} aria-labelledby="artist-title">
    <div className={styles.stickyHeader} hidden={!compactHeader} role="region" aria-label="Artist quick controls">
      <div className={styles.stickyContent}><button type="button" onClick={playAll} disabled={mainPlayDisabled} aria-label={`Play songs by ${displayTitle}`} className={styles.compactPlay}><FiPlay aria-hidden="true" /></button><span className={styles.compactTitle}>{displayTitle}</span></div>
    </div>
    <header ref={heroRef} className={`${styles.hero} ${banner ? styles.withBanner : styles.withoutBanner}`}>
      {banner ? <MediaImage src={banner} size="maxres" alt="" loading="eager" className={styles.banner} /> : artist.thumbnail ? <MediaImage src={artist.thumbnail} size="hq" alt="" loading="eager" className={styles.portrait} /> : null}
      <div className={styles.heroCopy}>
        <p className={styles.artistLabel}>Artist</p><h1 id="artist-title" className={styles.title}>{displayTitle}</h1>
        {!loading && !error && tracks.length > 0 && <p className={styles.heroCount}>{tracks.length} {tracks.length === 1 ? "song" : "songs"} available{nextPageToken ? " · more to explore" : ""}</p>}
      </div>
    </header>

    <div className={styles.content}>
      <div className={styles.actions} role="region" aria-label="Artist actions">
        <button type="button" onClick={playAll} disabled={mainPlayDisabled} aria-label={`Play songs by ${displayTitle}`} className={styles.mainPlay}><FiPlay aria-hidden="true" /></button>
        <button type="button" onClick={shuffle} disabled={mainPlayDisabled} aria-label={`Shuffle songs by ${displayTitle}`} title="Shuffle artist songs" className={styles.shuffle}><FiShuffle aria-hidden="true" /></button>
        {status === "authenticated" ? <button type="button" onClick={() => void toggleFollow()} disabled={followBusy || followLoading || Boolean(followError) || loading || Boolean(error)} aria-pressed={followed} className={styles.follow}>{followed ? <FiCheck aria-hidden="true" /> : <FiPlus aria-hidden="true" />}{followBusy ? "Saving…" : followLoading ? "Loading follow…" : followed ? "Following" : "Follow"}</button> : status === "unauthenticated" ? <Link href="/login" className={styles.follow}>Log in to follow</Link> : null}
        <ItemMenu label={`${displayTitle} artist options`} className={styles.artistMenu} actions={[
          { label: "Copy artist link", onSelect: async () => { await navigator.clipboard.writeText(window.location.href); toast.success("Artist link copied"); } },
          { label: "Open artist on YouTube", onSelect: () => window.open(`https://www.youtube.com/channel/${encodeURIComponent(artistId)}`, "_blank", "noopener,noreferrer") },
          { label: "About the artist", onSelect: () => {
            // ItemMenu restores its trigger when closing. Move focus afterward
            // so selecting About keeps the reader at the biography.
            window.setTimeout(() => {
              if (!mounted.current) return;
              const about = document.getElementById("artist-about");
              if (about?.parentElement?.tagName === "DETAILS") about.parentElement.open = true;
              about?.focus({ preventScroll: true });
              about?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
            }, 0);
          } },
        ]} />
      </div>

      {followError && <UserMessage title={followError.title} message={followError.message} onRetry={() => setFollowRetryKey(value => value + 1)} busy={followLoading} compact />}
      {loading && <div className={styles.feedback} role="status" aria-label="Loading artist songs"><p>Loading songs…</p><div aria-hidden="true"><SongRowsSkeleton count={5} /></div></div>}
      {!loading && error && <div className={styles.feedback}><UserMessage title={error.title} message={error.message} onRetry={() => setRetryKey(value => value + 1)} busy={loading} /></div>}

      {!loading && !error && <>
        <div className={styles.body}>
          <section className={styles.songs} aria-labelledby={primaryTracks.length ? "artist-songs-title" : undefined} aria-label={primaryTracks.length ? undefined : "Artist songs"}>
            {!primaryTracks.length ? <EmptyState eyebrow="Artist" title={`No songs found for ${displayTitle}`} message="Try another search to find playable tracks." href="/" actionLabel="Back to Home" /> : <>
              <div className={styles.sectionHeading}><h2 id="artist-songs-title">{popularTracks.length ? "Popular" : "Songs & videos"}</h2></div>
              {songs(visibleTracks, primaryTracks)}
              {primaryTracks.length > 5 && <button type="button" className={styles.textButton} aria-expanded={expandedSongs} onClick={() => setExpandedSongs(value => !value)}>{expandedSongs ? "Show less" : "See more"}</button>}
              {!popularTracks.length && nextPageToken && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={`btn-ghost ${styles.loadMore}`}>{loadingMore ? "Loading more…" : "Load more songs"}</button>}
            </>}
          </section>

          <aside className={styles.sidebar}>
            <section aria-labelledby="artist-liked-title" className={styles.liked}>
              <h2 id="artist-liked-title">You liked</h2>
              {status === "authenticated" ? likesError ? <UserMessage title={likesError.title} message={likesError.message} onRetry={() => setLikesRetryKey(value => value + 1)} busy={likesLoading} compact /> : likesLoading ? <p className={styles.sidebarHint} role="status">Loading your liked songs…</p> : likedTracks.length ? <button type="button" onClick={() => playTrack(likedTracks[0], likedTracks)} className={styles.likedCollection} aria-label={`Play ${likedTracks.length} liked ${likedTracks.length === 1 ? "song" : "songs"} by ${displayTitle}`}>
                <span className={styles.likedArt}><MediaImage src={artist.thumbnail || sectionArtist?.thumbnail} size="hq" alt="" className={styles.likedPortrait} /><FiHeart aria-hidden="true" /></span><span><strong>{likedTracks.length} {likedTracks.length === 1 ? "song" : "songs"}</strong><span className={styles.sidebarHint}>By {displayTitle}</span></span>
              </button> : <p className={styles.sidebarHint}><strong>No liked songs yet</strong><br />Save a song by {displayTitle} to find it here.</p> : <p className={styles.sidebarHint}><Link href="/login">Log in</Link> to see songs you liked.</p>}
            </section>
            {latestRelease && <section className={styles.spotlight} aria-labelledby="artist-latest-title"><h2 id="artist-latest-title">Release spotlight</h2><Link href={musicReleaseHref(latestRelease.id)} prefetch={false} className={styles.spotlightLink}><MediaImage src={latestRelease.thumbnail} size="hq" alt="" className={styles.spotlightArt} /><span><strong>{cleanTitle(latestRelease.title)}</strong><span className={styles.sidebarHint}>{[latestRelease.year, latestRelease.type === "ep" ? "EP" : latestRelease.type === "single" ? "Single" : "Album"].filter(Boolean).join(" · ")}</span></span></Link></section>}
          </aside>
        </div>

        {popularTracks.length > 0 && tracks.length > 0 && <details className={styles.channelCatalog}><summary className={styles.catalogSummary}>Songs &amp; videos<FiChevronDown aria-hidden="true" /></summary><section aria-label={`${displayTitle} channel songs`}>{songs(tracks)}{nextPageToken && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={`btn-ghost ${styles.loadMore}`}>{loadingMore ? "Loading more…" : "Load more songs"}</button>}</section></details>}
        {sectionsLoading && <p role="status" className={styles.catalogLoading}>Loading releases and playlists…</p>}
        {sectionsError && <div className={styles.catalogFeedback}><UserMessage title={sectionsError.title} message={sectionsError.message} onRetry={() => setSectionsRetryKey(value => value + 1)} busy={sectionsLoading} compact /></div>}
        <ArtistDiscography releases={releases} onPlay={release => playCollection(release, "album")} busyId={collectionBusyId} />
        <ArtistPlaylistRail playlists={playlists} artistName={displayTitle} onPlay={playlist => playCollection(playlist, "playlist")} busyId={collectionBusyId} />
        <ArtistVideoRail title="Music videos" id="artist-videos-title" videos={musicVideos} onPlay={playTrack} />
        <ArtistVideoRail title={`Watch more from ${displayTitle}`} id="artist-comments-title" videos={artistWatchMore} onPlay={playTrack} />
        <ArtistVideoRail title="More to explore" id="artist-discoveries-title" videos={moreToExplore} onPlay={playTrack} />
        <RelatedArtistRail artists={relatedArtists} />

        <section className={styles.about} aria-label={`About ${displayTitle}`}>
          {biography ? <details><summary id="artist-about" className={styles.aboutSummary}><h2>About {displayTitle}</h2><FiChevronDown aria-hidden="true" /></summary><div className={styles.aboutContent}>{artist.thumbnail && <MediaImage src={artist.thumbnail} size="hq" alt="" className={styles.aboutPortrait} />}<p className={styles.biography}>{cleanTitle(biography)}</p></div></details> : <><h2 id="artist-about" tabIndex={-1}>About {displayTitle}</h2><p className={styles.biography}>This channel hasn’t provided a biography yet.</p></>}
        </section>
      </>}
    </div>
  </div>;
}
