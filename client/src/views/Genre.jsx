import { useState } from "react";
import { useHashRoute } from "../hooks/useHashRoute";
import { useSearch } from "../hooks/useSearch";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { SkeletonTrackRow } from "../components/Skeletons";
import { TrackRow } from "../components/TrackRow";

export function Genre() {
  const { params } = useHashRoute();
  const genre = params.genre;
  const { results, artists, loading, error } = useSearch("", { genre, sort: "popularity", limit: 40 });
  const [playlistTrack, setPlaylistTrack] = useState(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  return <div className="genre-view reveal"><div className="view-intro"><span className="kicker">BROWSE GENRE</span><h1>{genre}</h1><p>Spotify catalog recordings and artists discovered under {genre}.</p></div>{artists.length > 0 && <div className="genre-artist-row">{artists.slice(0, 5).map((artist) => <article key={artist.name}><img src={artist.avatarUrl} alt="" /><span>{artist.name}</span></article>)}</div>}{error && <p className="inline-error">{error}</p>}<section className="track-list"><div className="track-list-header"><span>#</span><span>Title</span><span>Album</span><span>Duration</span></div>{loading ? Array.from({ length: 8 }, (_, index) => <SkeletonTrackRow key={index} />) : results.map((track, index) => <TrackRow track={track} key={track.id} index={index} contextQueue={results} context={{ type: "home" }} onAddToPlaylist={setPlaylistTrack} />)}{!loading && !results.length && <div className="empty-state"><h2>No songs in this genre yet</h2><p>Try another part of the catalog.</p></div>}</section>{playlistTrack && <AddToPlaylistModal track={playlistTrack} onClose={() => setPlaylistTrack(null)} onCreatePlaylist={() => { setPlaylistTrack(null); setCreatingPlaylist(true); }} />}{creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}</div>;
}