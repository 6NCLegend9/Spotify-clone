"use client";

import { useEffect, useState } from "react";
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
import styles from "./artistProfile.module.css";

function formatDuration(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0
    ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`
    : "—";
}

export default function ArtistProfile({ artistId, initialName = "" }) {
  const dispatch = useDispatch();
  const { status } = useSession();
  const [artist, setArtist] = useState({ id: artistId, title: initialName, description: "", thumbnail: "" });
  const [tracks, setTracks] = useState([]);
  const [nextPageToken, setNextPageToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [followed, setFollowed] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
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
    requestJson("/api/followedArtists", {
      signal: controller.signal,
      fallbackTitle: "Follow status unavailable",
      fallbackMessage: "You can still play this artist.",
    }).then((json) => {
      if (json?.success === true && Array.isArray(json.data)) {
        setFollowed(json.data.some((value) => value.toLowerCase() === artist.title.toLowerCase()));
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [artist.title, status]);

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
    if (status !== "authenticated" || !artist.title || followBusy) return;
    const next = !followed;
    setFollowBusy(true);
    setFollowed(next);
    try {
      const data = await requestJson("/api/followedArtists", {
        method: "POST",
        body: { name: artist.title, channelId: artist.id, thumbnail: artist.thumbnail },
        fallbackTitle: "Follow couldn’t be updated",
        fallbackMessage: "Your follow change wasn’t saved. Please try again.",
      });
      if (data?.success === true && Array.isArray(data.data)) {
        setFollowed(data.data.some((value) => value.toLowerCase() === artist.title.toLowerCase()));
      }
      window.dispatchEvent(new Event(FOLLOWS_CHANGED_EVENT));
      toast.success(next ? "Followed" : "Unfollowed");
    } catch (followError) {
      setFollowed(!next);
      toast.error(toUserError(followError).message);
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <div className={`page ${styles.page}`} aria-labelledby="artist-title">
      <header className={styles.hero}>
        <MediaImage src={artist.thumbnail} size="hq" alt="" loading="eager" width={192} height={192} className={styles.portrait} />
        <div className={styles.heroCopy}>
          <p className="eyebrow">Artist</p>
          <h1 id="artist-title" className={styles.title}>{displayTitle}</h1>
          <p className={styles.subtitle}>Songs and videos from this artist.</p>
          {!loading && !error && tracks.length > 0 && <p className={styles.count}>{tracks.length} {tracks.length === 1 ? "song" : "songs"}{nextPageToken ? " loaded" : ""}</p>}
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={playAll} disabled={loading || Boolean(error) || tracks.length === 0} aria-label={`Play songs by ${displayTitle}`} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"><FiPlay aria-hidden="true" className={styles.playIcon} />Play</button>
          {status === "authenticated" ? <button type="button" onClick={() => void toggleFollow()} disabled={followBusy || loading || Boolean(error)} aria-pressed={followed} className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50">{followed ? <FiCheck aria-hidden="true" /> : <FiPlus aria-hidden="true" />}{followBusy ? "Saving…" : followed ? "Following" : "Follow"}</button> : status === "unauthenticated" ? <Link href="/login" className="btn-ghost">Log in to follow</Link> : null}
          {!loading && !error && artist.description && <a href="#artist-about" className={styles.aboutLink}>About the artist</a>}
        </div>
      </header>

      {loading && <div className={styles.feedback} role="status" aria-label="Loading artist songs"><p>Loading songs…</p><div aria-hidden="true"><SongRowsSkeleton count={5} /></div></div>}
      {!loading && error && <div className={styles.feedback}><UserMessage title={error.title} message={error.message} onRetry={() => setRetryKey((value) => value + 1)} busy={loading} /></div>}
      {!loading && !error && <div className={styles.body}>
        <section className={styles.songs} aria-labelledby={tracks.length ? "artist-songs-title" : undefined} aria-label={tracks.length ? undefined : "Artist songs"}>
          {tracks.length === 0 ? <EmptyState eyebrow="Artist" title={`No songs found for ${displayTitle}`} message="Try another search to find playable tracks." href="/" actionLabel="Back to Home" /> : <>
          <div className={styles.sectionHeading}><h2 id="artist-songs-title">Songs &amp; videos</h2><span className={styles.count}>{tracks.length} loaded</span></div>
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

        <aside className={styles.about}>
          {artist.description ? <details>
            <summary id="artist-about" className={styles.aboutSummary}><h2>About {displayTitle}</h2><FiChevronDown aria-hidden="true" /></summary>
            <p className={styles.biography}>{cleanTitle(artist.description)}</p>
          </details> : <><h2>About {displayTitle}</h2><p className={styles.biography}>This channel hasn’t provided a biography yet.</p></>}
        </aside>
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
    </div>
  );
}
