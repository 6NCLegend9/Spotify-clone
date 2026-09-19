import { notFound } from "next/navigation";
import { resolveParams } from "@/utils/routeParams";
import { loadPublicPlaylistShare } from "@/utils/publicPlaylistShare.mjs";
import {
  LISTEN_ON_HEYKASA,
  kasaShareMetadata,
  playlistListenUrl,
  youtubeShareArt,
} from "@/utils/shareCard.mjs";
import { SITE_NAME } from "@/utils/siteConfig";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { playlistId } = await resolveParams(params);
  try {
    const playlist = await loadPublicPlaylistShare(playlistId);
    if (!playlist) {
      return { title: "Playlist", robots: { index: false, follow: false } };
    }
    return kasaShareMetadata({
      title: playlist.name,
      path: `/embed/playlist/${playlist.id}`,
      image: playlist.image,
      indexable: false,
    });
  } catch {
    return { title: "Playlist", robots: { index: false, follow: false } };
  }
}

export default async function EmbedPlaylistPage({ params }) {
  const { playlistId } = await resolveParams(params);
  let playlist = null;
  try {
    playlist = await loadPublicPlaylistShare(playlistId);
  } catch {
    playlist = null;
  }
  if (!playlist) notFound();

  const listenUrl = playlistListenUrl(playlist.id);

  return (
    <main className="kasa-embed">
      <a className="kasa-embed-hero" href={listenUrl} target="_blank" rel="noopener noreferrer">
        <img className="kasa-embed-art" src={playlist.image} alt="" width="88" height="88" />
        <div className="kasa-embed-copy">
          <p className="kasa-embed-brand">{SITE_NAME}</p>
          <h1 className="kasa-embed-title">{playlist.name}</h1>
          <p className="kasa-embed-meta">
            {playlist.songCount} {playlist.songCount === 1 ? "song" : "songs"}
          </p>
        </div>
        <span className="kasa-embed-listen">{LISTEN_ON_HEYKASA}</span>
      </a>
      {playlist.songs.length ? (
        <ol className="kasa-embed-tracks">
          {playlist.songs.map((id, index) => (
            <li key={id}>
              <a href={listenUrl} target="_blank" rel="noopener noreferrer">
                <span className="kasa-embed-index">{index + 1}</span>
                <img src={youtubeShareArt(id)} alt="" width="40" height="40" />
                <span className="kasa-embed-track-title">Track {index + 1}</span>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="kasa-embed-empty">Open HayKasa to play this playlist.</p>
      )}
    </main>
  );
}
