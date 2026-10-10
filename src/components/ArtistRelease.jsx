"use client";

import { formatDuration } from "@/utils/trackDuration.mjs";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { FiArrowLeft, FiClock, FiLink, FiPlay } from "react-icons/fi";
import toast from "react-hot-toast";
import { startYoutubePlayback } from "@/redux/features/playerSlice";
import MediaImage from "@/components/MediaImage";
import ArtistNameLink from "@/components/ArtistNameLink";
import AddToQueueButton from "@/components/AddToQueueButton";
import FavouriteTrackButton from "@/components/FavouriteTrackButton";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import EmptyState from "@/components/EmptyState";
import UserMessage from "@/components/UserMessage";
import { SongRowsSkeleton } from "@/components/Skeleton";
import { requestJson } from "@/services/http";
import { toUserError } from "@/utils/userError";
import { cleanTitle } from "@/utils/text";
import { isYoutubeVideoId } from "@/utils/youtubeVideoId.mjs";
import styles from "./artistRelease.module.css";

const RELEASE_TYPES = { album: "Album", single: "Single", ep: "EP" };

export default function ArtistRelease({ albumId }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const [album, setAlbum] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setAlbum(null);
    setTracks([]);
    requestJson(`/api/youtube-album?id=${encodeURIComponent(albumId)}`, {
      signal: controller.signal,
      fallbackTitle: "Release unavailable",
      fallbackMessage: "We couldn’t load this release. Please try again.",
    }).then(data => {
      if (controller.signal.aborted) return;
      if (!data?.album?.title) throw new Error("Release metadata was unavailable.");
      const seen = new Set();
      const playable = (Array.isArray(data.tracks) ? data.tracks : []).filter(track => {
        if (!isYoutubeVideoId(track?.id) || track.unavailable || track.playable === false || seen.has(track.id)) return false;
        seen.add(track.id);
        return true;
      });
      setAlbum(data.album);
      setTracks(playable);
    }).catch(failure => {
      if (!controller.signal.aborted) {
        setError(toUserError(failure, {
          title: "Release unavailable",
          message: "We couldn’t load this release. Please try again.",
        }));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [albumId, retryKey]);

  const title = cleanTitle(album?.title, "Release");
  const queue = useMemo(() => tracks.map(track => ({
    ...track,
    seedQuery: track.seedQuery || title,
    genre: track.genre || title,
  })), [title, tracks]);

  const play = (video = queue[0]) => {
    if (!video || !queue.length) return;
    dispatch(startYoutubePlayback({
      queue,
      track: queue.find(track => track.id === video.id) || queue[0],
      queueMode: "collection",
      autoExtend: false,
      context: { type: "album", id: albumId, name: title },
    }));
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/album/${encodeURIComponent(albumId)}`);
      toast.success("Release link copied");
    } catch {
      toast.error("Couldn’t copy the release link. Please try again.");
    }
  };

  return (
    <div className={`page ${styles.page}`}>
      <header className={styles.hero}>
        <button type="button" onClick={() => router.back()} className={styles.back}>
          <FiArrowLeft aria-hidden="true" /> Back
        </button>
        {album && !loading && !error ? <div className={styles.heroIdentity}>
          <MediaImage src={album.thumbnail || tracks[0]?.thumbnail} size="hq" alt="" className={styles.cover} width={240} height={240} loading="eager" />
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{RELEASE_TYPES[album.type] || "Release"}</p>
            <h1>{title}</h1>
            <div className={styles.metadata}>
              <ArtistNameLink track={{ artists: album.artists }} className={styles.artistCredits} />
              {album.year && <span>{album.year}</span>}
              <span>{tracks.length} {tracks.length === 1 ? "song" : "songs"}</span>
            </div>
            {album.description && <p className={styles.description}>{cleanTitle(album.description)}</p>}
          </div>
        </div> : loading ? <div className={styles.loadingTitle} role="status">Loading release…</div> : null}
      </header>

      <div className={styles.content}>
        {loading && <div aria-label="Loading release songs"><SongRowsSkeleton count={5} /></div>}
        {!loading && error && <UserMessage title={error.title} message={error.message} onRetry={() => setRetryKey(value => value + 1)} />}
        {!loading && !error && album && <>
          <section className={styles.actions} aria-label="Release actions">
            <button type="button" onClick={() => play()} disabled={!queue.length} aria-label={`Play ${title}`} className={styles.playAll}>
              <FiPlay aria-hidden="true" />
            </button>
            <button type="button" onClick={() => void copyLink()} className={styles.copyLink}><FiLink aria-hidden="true" /> Copy link</button>
          </section>
          {tracks.length === 0 ? <EmptyState title="No playable songs in this release" message="The catalog hasn’t provided playable songs for this release yet." /> : <section aria-label={`${title} songs`}>
            <div className={styles.rowHeading} aria-hidden="true"><span>#</span><span>Title</span><span /><FiClock /><span /></div>
            <ol className={styles.trackList}>
              {tracks.map((track, index) => <ContextMenuTarget as="li" key={track.id} className={styles.trackRow}>
                <button type="button" aria-label={`Play ${cleanTitle(track.title, "Untitled track")}`} onClick={() => play(track)} className={styles.rowPlay}>
                  <span className={styles.rowNumber}>{index + 1}</span><FiPlay className={styles.rowPlayIcon} aria-hidden="true" />
                </button>
                <div className={styles.songIdentity}>
                  <MediaImage src={track.thumbnail || album.thumbnail} size="mq" alt="" width={44} height={44} className={styles.trackArt} />
                  <div className={styles.songCopy}>
                    <button type="button" onClick={() => play(track)} className={styles.trackTitle}>{cleanTitle(track.title, "Untitled track")}</button>
                    <ArtistNameLink track={track} className={styles.trackCredits} />
                    <span className={styles.mobileDuration} aria-label={`Duration: ${formatDuration(track.duration)}`}>{formatDuration(track.duration)}</span>
                  </div>
                </div>
                <FavouriteTrackButton track={track} className={styles.favourite} />
                <span className={styles.duration} aria-label={`Duration: ${formatDuration(track.duration)}`}>{formatDuration(track.duration)}</span>
                <AddToQueueButton track={track} className={styles.queueButton} />
              </ContextMenuTarget>)}
            </ol>
          </section>}
        </>}
      </div>
    </div>
  );
}
