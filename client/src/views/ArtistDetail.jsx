import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { navigate, useHashRoute } from "../hooks/useHashRoute";
import { useLibrary } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ToastContext";
import { AlbumCard } from "../components/AlbumCard";
import { ArtistCard } from "../components/ArtistCard";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { Icon } from "../components/Icon";
import { SkeletonCover, SkeletonTrackRow } from "../components/Skeletons";
import { StartRadioButton } from "../components/StartRadioButton";
import { TrackRow } from "../components/TrackRow";

function formatFollowerCount(count) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(count) || 0);
}

export function ArtistDetail() {
  const { params } = useHashRoute();
  const { play } = usePlayer();
  const { invalidateRecommendations } = useLibrary();
  const { notify } = useToast();
  const [artist, setArtist] = useState(null);
  const [topTracks, setTopTracks] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [relatedArtists, setRelatedArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followPending, setFollowPending] = useState(false);
  const [playlistTrack, setPlaylistTrack] = useState(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/api/artists/${params.id}`);
        if (!active) return;
        setArtist(response.data);
        setTopTracks(response.topTracks || []);
        setAlbums(response.albums || []);
        setRelatedArtists(response.relatedArtists || []);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError.message || "Artist details are unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [params.id]);

  const toggleFollow = async () => {
    if (!artist || followPending) return;
    const wasFollowed = artist.isFollowed;
    setFollowPending(true);
    setArtist((current) => current ? { ...current, isFollowed: !wasFollowed, followerCount: Math.max(0, current.followerCount + (wasFollowed ? -1 : 1)) } : current);
    try {
      if (wasFollowed) await api.delete(`/api/artists/${artist.id}/follow`);
      else await api.post(`/api/artists/${artist.id}/follow`);
      invalidateRecommendations();
      notify(wasFollowed ? "Removed from followed artists" : "Added to followed artists", "success");
    } catch (requestError) {
      setArtist((current) => current ? { ...current, isFollowed: wasFollowed, followerCount: Math.max(0, current.followerCount + (wasFollowed ? 1 : -1)) } : current);
      notify(requestError.message || "Unable to update followed artists", "error");
    } finally {
      setFollowPending(false);
    }
  };

  const playTopTracks = () => {
    if (!topTracks.length) return;
    play(topTracks[0], topTracks, 0, { type: "artist", refId: artist.id });
  };

  if (loading) return <div className="catalog-detail reveal"><section className="catalog-hero"><SkeletonCover /><div className="catalog-hero-copy"><span className="skeleton-line wide" /><span className="skeleton-line" /></div></section><section className="track-list">{Array.from({ length: 7 }, (_, index) => <SkeletonTrackRow key={index} />)}</section></div>;
  if (error || !artist) return <div className="empty-state reveal"><h1>Artist unavailable</h1><p>{error || "This artist could not be found."}</p><button className="secondary-button" onClick={() => navigate("/")}>Back home</button></div>;

  return <div className="catalog-detail artist-detail reveal">
    <section className="catalog-hero artist-hero">
      <img className="artist-portrait" src={artist.avatarUrl || "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80"} alt={`${artist.name} portrait`} />
      <div className="catalog-hero-copy"><span className="kicker">ARTIST</span><h1>{artist.name}</h1><p>{artist.bio || "Artist profile metadata provided by Spotify."}</p><small>{artist.genres.length > 0 && <>{artist.genres.join(" / ")} <span>•</span> </>}{formatFollowerCount(artist.followerCount)} followers <span>•</span> {artist.albumCount} releases</small><div className="catalog-actions"><button className="primary-button" onClick={playTopTracks} disabled={!topTracks.length}><Icon name="play" />Play</button><button className="secondary-button" onClick={toggleFollow} disabled={followPending}>{artist.isFollowed ? "Following" : "Follow"}</button><StartRadioButton seedType="artist" seedId={artist.id}>Artist radio</StartRadioButton></div></div>
    </section>
    <section className="section"><div className="section-heading"><div><span className="kicker">MOST PLAYED</span><h2>Top tracks</h2></div></div><div className="track-list"><div className="track-list-header"><span>#</span><span>Title</span><span>Album</span><span>Duration</span></div>{topTracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} contextQueue={topTracks} context={{ type: "artist", refId: artist.id }} onAddToPlaylist={setPlaylistTrack} />)}</div></section>
    <section className="section"><div className="section-heading"><div><span className="kicker">DISCOGRAPHY</span><h2>Albums</h2></div><span>{albums.length} releases</span></div><div className="album-grid">{albums.map((album) => <AlbumCard key={album.id} album={album} />)}</div></section>
    <section className="section"><div className="section-heading"><div><span className="kicker">DISCOVER</span><h2>Related artists</h2></div></div><div className="artist-card-grid">{relatedArtists.map((relatedArtist) => <ArtistCard key={relatedArtist.id} artist={relatedArtist} />)}</div></section>
    {playlistTrack && <AddToPlaylistModal track={playlistTrack} onClose={() => setPlaylistTrack(null)} onCreatePlaylist={() => { setPlaylistTrack(null); setCreatingPlaylist(true); }} />}
    {creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}
  </div>;
}