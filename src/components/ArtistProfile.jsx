"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { FiCheck, FiChevronDown, FiClock, FiPlay, FiPlus } from "react-icons/fi";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import toast from "react-hot-toast";
import MediaImage from "@/components/MediaImage";
import PlayFab from "@/components/PlayFab";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { SongRowsSkeleton } from "@/components/Skeleton";
import ArtistNameLink from "@/components/ArtistNameLink";
import AddToQueueButton from "@/components/AddToQueueButton";
import ContextMenuTarget from "@/components/ContextMenuTarget";
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
  return <AccountArtistProfile key={`${owner || status}:${props.artistId}`} {...props} status={status} />;
}

function AccountArtistProfile({ artistId, initialName = "", status }) {
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

  const playAll = () => { if (tracks[0]) playTrack(tracks[0]); };

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
      setTracks((current) => {
        const seen = new Set(current.map((track) => track.id));
        return [...current, ...extra.filter((track) => track?.id && !seen.has(track.id))];
      });
      setNextPageToken(typeof data?.nextPageToken === "string" ? data.nextPageToken : "");
    } catch (loadError) {
      toast.error(toUserError(loadError, { title: "More songs unavailable", message: "We couldn’t load more songs. Please try again." }).message);
    } finally {
      setLoadingMore(false);
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

  return (
    <div className={`page ${styles.page}`} aria-labelledby="artist-title">
      <header className={styles.header}>
        <div className={styles.hero}>
          {artist.thumbnail && <MediaImage src={artist.thumbnail} size="hq" alt="" loading="eager" className={styles.heroArtwork} />}
          <div className={styles.heroCopy}>
            <p className={styles.artistLabel}>Artist</p>
            <h1 id="artist-title" className={styles.title}>{displayTitle}</h1>
            {!loading && !error && tracks.length > 0 && <p className={styles.count}>{tracks.length} {tracks.length === 1 ? "song" : "songs"}{nextPageToken ? " loaded" : ""}</p>}
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={playAll} disabled={loading || Boolean(error) || tracks.length === 0} aria-label={`Play songs by ${displayTitle}`} className={styles.playButton}><FiPlay aria-hidden="true" className={styles.playIcon} /></button>
          {status === "authenticated" ? <button type="button" onClick={() => void toggleFollow()} disabled={followBusy || followLoading || Boolean(followError) || loading || Boolean(error)} aria-pressed={followed} className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50">{followed ? <FiCheck aria-hidden="true" /> : <FiPlus aria-hidden="true" />}{followBusy ? "Saving…" : followLoading ? "Loading follow…" : followed ? "Following" : "Follow"}</button> : status === "unauthenticated" ? <Link href="/login" className="btn-ghost">Log in to follow</Link> : null}
          {!loading && !error && artist.description && <a href="#artist-about" className={styles.aboutLink}>About the artist</a>}
        </div>
      </header>

      {followError && <UserMessage title={followError.title} message={followError.message} onRetry={() => setFollowRetryKey(value => value + 1)} busy={followLoading} compact />}
      {loading && <div className={styles.feedback} role="status" aria-label="Loading artist songs"><p>Loading songs…</p><div aria-hidden="true"><SongRowsSkeleton count={5} /></div></div>}
      {!loading && error && <div className={styles.feedback}><UserMessage title={error.title} message={error.message} onRetry={() => setRetryKey((value) => value + 1)} busy={loading} /></div>}
      {!loading && !error && <div className={styles.body}>
        <section className={styles.songs} aria-labelledby={tracks.length ? "artist-songs-title" : undefined} aria-label={tracks.length ? undefined : "Artist songs"}>
          {tracks.length === 0 ? <EmptyState eyebrow="Artist" title={`No songs found for ${displayTitle}`} message="Try another search to find playable tracks." href="/" actionLabel="Back to Home" /> : <>
          <div className={styles.sectionHeading}><h2 id="artist-songs-title">Popular</h2></div>
          <div className={styles.rowHeading} aria-hidden="true"><span>#</span><span>Title</span><FiClock /><span /></div>
          <ol className={styles.songList}>
            {tracks.map((video, index) => <ContextMenuTarget as="li" key={video.id} className={styles.songRow}>
              <button type="button" aria-label={`Play ${cleanTitle(video.title)}`} onClick={() => playTrack(video)} className={styles.rowPlay}><span className={styles.rowIndex}>{index + 1}</span><FiPlay className={styles.rowPlayIcon} aria-hidden="true" /></button>
              <div className={styles.songIdentity}>
                <MediaImage src={video.thumbnail} size="mq" alt="" width={48} height={48} className={styles.songArt} />
                <div className={styles.songCopy}>
                  <button type="button" onClick={() => playTrack(video)} className={styles.songTitle}>{cleanTitle(video.title, "Untitled track")}</button>
                  <ArtistNameLink track={video} className={styles.credits} />
                </div>
              </div>
              <span className={styles.duration} aria-label={`Duration: ${formatDuration(video.duration)}`}>{formatDuration(video.duration)}</span>
              <AddToQueueButton track={video} className={styles.queueButton} />
            </ContextMenuTarget>)}
          </ol>
          {nextPageToken && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={`btn-ghost ${styles.loadMore} disabled:opacity-60`}>{loadingMore ? "Loading more…" : "Load more songs"}</button>}
          </>}
        </section>
      </div>}

      {!loading && !error && alsoPlayVisible.length > 0 && <section className={styles.related} aria-labelledby="artist-comments-title">
        <div className={styles.sectionHeading}><div><h2 id="artist-comments-title">More to explore</h2><p className={styles.subtitle}>Discover songs connected to this artist.</p></div></div>
        <div className={styles.relatedGrid}>
          {alsoPlayVisible.map(video => <ContextMenuTarget as="article" key={video.id} className={styles.relatedCard}>
            <button type="button" aria-label={`Play ${cleanTitle(video.title)}`} onClick={() => playTrack(video, alsoPlayVisible)} className={styles.relatedCover}><MediaImage src={video.thumbnail} size="hq" alt="" className={styles.relatedArt} /><PlayFab /></button>
            <div className={styles.relatedCopy}>
              <button type="button" onClick={() => playTrack(video, alsoPlayVisible)} className={styles.songTitle}>{cleanTitle(video.title, "Untitled track")}</button>
              <ArtistNameLink track={video} className={styles.credits} />
              <div className={styles.relatedTools}><span className={styles.duration}>{formatDuration(video.duration)}</span><AddToQueueButton track={video} className={styles.queueButton} /></div>
            </div>
          </ContextMenuTarget>)}
        </div>
      </section>}

      {!loading && !error && <section className={styles.about} aria-labelledby="artist-about-title">
        <h2 id="artist-about-title">About</h2>
        <div className={styles.aboutCard}>
          <MediaImage src={artist.thumbnail} size="hq" alt="" width={96} height={96} className={styles.portrait} />
          {artist.description && <p className={styles.aboutPreview}>{cleanTitle(artist.description).slice(0, 180)}{cleanTitle(artist.description).length > 180 ? "…" : ""}</p>}
          {artist.description ? <details>
            <summary id="artist-about" className={styles.aboutSummary}><span>About {displayTitle}</span><FiChevronDown aria-hidden="true" /></summary>
            <p className={styles.biography}>{cleanTitle(artist.description)}</p>
          </details> : <><h3>{displayTitle}</h3><p className={styles.biography}>This channel hasn’t provided a biography yet.</p></>}
        </div>
      </section>}
    </div>
  );
}
