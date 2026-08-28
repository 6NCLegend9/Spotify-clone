import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { navigate, useHashRoute } from "../hooks/useHashRoute";
import { useLibrary } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ToastContext";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { Icon } from "../components/Icon";
import { SkeletonCover, SkeletonTrackRow } from "../components/Skeletons";
import { TrackRow } from "../components/TrackRow";

export function AlbumDetail() {
  const { params } = useHashRoute();
  const { play } = usePlayer();
  const { notify } = useToast();
  const [album, setAlbum] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savePending, setSavePending] = useState(false);
  const [playlistTrack, setPlaylistTrack] = useState(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/api/albums/${params.id}`);
        if (!active) return;
        setAlbum(response.data);
        setTracks(response.tracks || []);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError.message || "Album details are unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [params.id]);

  const toggleSaved = async () => {
    if (!album || savePending) return;
    const wasSaved = album.isSaved;
    setSavePending(true);
    setAlbum((current) => current ? { ...current, isSaved: !wasSaved } : current);
    try {
      if (wasSaved) await api.delete(`/api/albums/${album.id}/save`);
      else await api.post(`/api/albums/${album.id}/save`);
      notify(wasSaved ? "Removed from saved albums" : "Saved to your library", "success");
    } catch (requestError) {
      setAlbum((current) => current ? { ...current, isSaved: wasSaved } : current);
      notify(requestError.message || "Unable to update saved albums", "error");
    } finally {
      setSavePending(false);
    }
  };

  if (loading) return <div className="catalog-detail reveal"><section className="catalog-hero"><SkeletonCover /><div className="catalog-hero-copy"><span className="skeleton-line wide" /><span className="skeleton-line" /></div></section><section className="track-list">{Array.from({ length: 7 }, (_, index) => <SkeletonTrackRow key={index} />)}</section></div>;
  if (error || !album) return <div className="empty-state reveal"><h1>Album unavailable</h1><p>{error || "This album could not be found."}</p><button className="secondary-button" onClick={() => navigate("/")}>Back home</button></div>;

  return <div className="catalog-detail album-detail reveal">
    <section className="catalog-hero album-hero"><img src={album.coverUrl || "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800&q=80"} alt={`${album.title} cover`} /><div className="catalog-hero-copy"><span className="kicker">ALBUM</span><h1>{album.title}</h1><button className="catalog-artist-link" onClick={() => navigate(`/artist/${album.artistId}`)}>{album.artistName}</button><p>{album.description || "Album metadata provided by Spotify."}</p><small>{album.releaseYear || formatDate(album.releaseDate)} <span>•</span> {tracks.length || album.trackCount} songs{album.genres.length > 0 && <> <span>•</span> {album.genres.join(" / ")}</>}</small><div className="catalog-actions"><button className="primary-button" onClick={() => tracks.length && play(tracks[0], tracks, 0, { type: "album", refId: album.id })} disabled={!tracks.length}><Icon name="play" />Play</button><button className={`icon-button ${album.isSaved ? "is-liked" : ""}`} aria-label={album.isSaved ? "Remove album from your library" : "Save album to your library"} title={album.isSaved ? "Remove from your library" : "Save to your library"} onClick={toggleSaved} disabled={savePending}><Icon name="heart" filled={album.isSaved} /></button></div></div></section>
    <section className="songs-panel album-songs-panel"><div className="songs-panel-heading"><div><span className="kicker">TRACKLIST</span><h2>{tracks.length} songs</h2></div><span>{album.releaseYear || formatDate(album.releaseDate)}</span></div><div className="track-list"><div className="track-list-header"><span>#</span><span>Title</span><span>Album</span><span>Duration</span></div>{tracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} contextQueue={tracks} context={{ type: "album", refId: album.id }} onAddToPlaylist={setPlaylistTrack} />)}</div></section>
    {playlistTrack && <AddToPlaylistModal track={playlistTrack} onClose={() => setPlaylistTrack(null)} onCreatePlaylist={() => { setPlaylistTrack(null); setCreatingPlaylist(true); }} />}
    {creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}
  </div>;
}