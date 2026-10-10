"use client";

import { useState } from "react";
import Link from "next/link";
import { FiPlay } from "react-icons/fi";
import HorizontalRail from "@/components/HorizontalRail";
import MediaImage from "@/components/MediaImage";
import ArtistNameLink from "@/components/ArtistNameLink";
import AddToQueueButton from "@/components/AddToQueueButton";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import { artistPageHref, musicReleaseHref } from "@/utils/artistNavigation.mjs";
import { cleanTitle } from "@/utils/text";
import { formatDuration } from "@/utils/trackDuration.mjs";
import styles from "./artistProfile.module.css";

function Rail({ title, id, items, children, controls }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  return <section className={styles.catalogSection} aria-labelledby={id}>
    <div className={styles.sectionHeading}>
      <h2 id={id}>{title}</h2>
      <button type="button" className={styles.textButton} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : "Show all"}</button>
    </div>
    {controls}
    {expanded ? <div className={styles.catalogGrid}>{children}</div> : <HorizontalRail label={`${title} collection`} className={styles.catalogRail}>{children}</HorizontalRail>}
  </section>;
}

export function ArtistDiscography({ releases, onPlay, busyId }) {
  const [filter, setFilter] = useState("popular");
  const availableReleases = releases.filter(release => musicReleaseHref(release?.id));
  const items = availableReleases.filter(release => filter === "popular" || (filter === "albums" ? release.type === "album" : release.type === "single" || release.type === "ep"));
  if (!availableReleases.length) return null;
  const filters = [["popular", "Popular releases"], ["albums", "Albums"], ["singles", "Singles and EPs"]];
  const controls = <div className={styles.filters} role="group" aria-label="Discography filters">{filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={styles.filter} onClick={() => setFilter(value)}>{label}</button>)}</div>;
  return <div className={styles.discography}>
    {items.length ? <Rail title="Discography" id="artist-discography-title" items={items} controls={controls}>
      {items.map(release => <article key={release.id} className={styles.catalogCard}>
        <Link href={musicReleaseHref(release.id)} prefetch={false} aria-label={cleanTitle(release.title, "Release")} className={styles.catalogLink}>
          <MediaImage src={release.thumbnail} size="hq" alt="" className={styles.releaseArt} />
          <h3 className={styles.cardTitle}>{cleanTitle(release.title, "Release")}</h3>
          <p className={styles.cardDescription}>{[release.year, release.type === "ep" ? "EP" : release.type === "single" ? "Single" : "Album"].filter(Boolean).join(" · ")}</p>
        </Link>
        <button type="button" className={styles.cardPlay} disabled={Boolean(busyId)} aria-busy={busyId === release.id} aria-label={`Play ${cleanTitle(release.title, "release")}`} onClick={() => void onPlay(release)}><FiPlay aria-hidden="true" /></button>
      </article>)}
    </Rail> : <section aria-labelledby="artist-discography-title"><div className={styles.sectionHeading}><h2 id="artist-discography-title">Discography</h2></div>{controls}<p className={styles.sectionEmpty}>No {filter === "albums" ? "albums" : "singles or EPs"} are available for this artist.</p></section>}
  </div>;
}

export function ArtistPlaylistRail({ playlists, artistName, onPlay, busyId }) {
  return <Rail title={`Featuring ${artistName}`} id="artist-playlists-title" items={playlists}>
    {playlists.map(playlist => <article key={playlist.id} className={styles.catalogCard}>
      <Link href={`/youtube-playlist/${encodeURIComponent(playlist.id)}?title=${encodeURIComponent(playlist.title || "Playlist")}`} prefetch={false} aria-label={cleanTitle(playlist.title, "Playlist")} className={styles.catalogLink}>
        <MediaImage src={playlist.thumbnail} size="hq" alt="" className={styles.releaseArt} />
        <h3 className={styles.cardTitle}>{cleanTitle(playlist.title, "Playlist")}</h3>
        <p className={styles.cardDescription}>{cleanTitle(playlist.description || "Playlist")}</p>
      </Link>
      <button type="button" className={styles.cardPlay} disabled={Boolean(busyId)} aria-busy={busyId === playlist.id} aria-label={`Play ${cleanTitle(playlist.title, "playlist")}`} onClick={() => void onPlay(playlist)}><FiPlay aria-hidden="true" /></button>
    </article>)}
  </Rail>;
}

export function ArtistVideoRail({ title, id, videos, onPlay }) {
  return <Rail title={title} id={id} items={videos}>
    {videos.map(video => <ContextMenuTarget as="article" key={video.id} className={`${styles.catalogCard} ${styles.videoCard}`}>
      <button type="button" className={styles.videoCover} aria-label={`Play ${cleanTitle(video.title)}`} onClick={() => onPlay(video, videos)}>
        <MediaImage src={video.thumbnail} size="hq" alt="" className={styles.videoArt} /><span className={styles.videoPlay} aria-hidden="true"><FiPlay /></span>
      </button>
      <button type="button" onClick={() => onPlay(video, videos)} className={styles.cardTitle}>{cleanTitle(video.title, "Untitled video")}</button>
      <ArtistNameLink track={video} className={styles.cardDescription} />
      <div className={styles.videoTools}><span className={styles.duration}>{formatDuration(video.duration)}</span><AddToQueueButton track={video} className={styles.queueButton} /></div>
    </ContextMenuTarget>)}
  </Rail>;
}

export function RelatedArtistRail({ artists }) {
  return <Rail title="Fans also like" id="artist-related-title" items={artists}>
    {artists.map(artist => <article key={artist.id} className={styles.catalogCard}>
      <Link href={artistPageHref(artist.id, artist.title)} prefetch={false} className={styles.catalogLink} aria-label={cleanTitle(artist.title, "Artist")}>
        <MediaImage src={artist.thumbnail} size="hq" alt="" className={styles.relatedArtistArt} />
        <h3 className={styles.cardTitle}>{cleanTitle(artist.title, "Artist")}</h3><p className={styles.cardDescription}>Artist</p>
      </Link>
    </article>)}
  </Rail>;
}
