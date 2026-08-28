import { useEffect, useState } from "react";
import { useHashRoute, navigate } from "../hooks/useHashRoute";
import { useLibrary } from "../context/LibraryContext";
import { usePagedCollection } from "../hooks/usePagedCollection";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { AlbumCard } from "../components/AlbumCard";
import { ArtistCard } from "../components/ArtistCard";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { PlaylistCard } from "../components/PlaylistCard";
import { SkeletonPlaylistCard, SkeletonTrackRow } from "../components/Skeletons";
import { TrackRow } from "../components/TrackRow";

export function Library() {
	const { query } = useHashRoute();
	const { playlists, likedTracks, likesLoading, likesLoadingMore, likesError, likesNextCursor, playlistsLoading, playlistsLoadingMore, playlistsError, playlistsNextCursor, loadMoreLikes, loadMorePlaylists } = useLibrary();
	const allowedTabs = new Set(["playlists", "liked", "artists", "albums"]);
	const [tab, setTab] = useState(allowedTabs.has(query.tab) ? query.tab : "playlists");
	const followedArtists = usePagedCollection("/api/artists", { followed: true }, { enabled: tab === "artists" });
	const savedAlbums = usePagedCollection("/api/albums", { saved: true }, { enabled: tab === "albums" });
	const [playlistTrack, setPlaylistTrack] = useState(null);
	const [creatingPlaylist, setCreatingPlaylist] = useState(false);
	const ownedPlaylists = playlists.filter((playlist) => playlist.isOwner);
	const followedPlaylists = playlists.filter((playlist) => !playlist.isOwner);

	useEffect(() => {
		setTab(allowedTabs.has(query.tab) ? query.tab : "playlists");
	}, [query.tab]);

	const switchTab = (nextTab) => {
		setTab(nextTab);
		navigate(`/library?tab=${nextTab}`);
	};

	return <div className="library-view reveal">
		<div className="view-intro library-intro"><div><span className="kicker">YOUR LIBRARY</span><h1>Keep what moves you.</h1><p>Likes, playlists, artists, and albums stay connected to your discovery profile.</p></div><button className="primary-button" onClick={() => setCreatingPlaylist(true)}>Create playlist</button></div>
		<div className="library-tabs" role="tablist"><button className={tab === "playlists" ? "is-selected" : ""} role="tab" aria-selected={tab === "playlists"} onClick={() => switchTab("playlists")}>Playlists</button><button className={tab === "liked" ? "is-selected" : ""} role="tab" aria-selected={tab === "liked"} onClick={() => switchTab("liked")}>Liked Songs</button><button className={tab === "artists" ? "is-selected" : ""} role="tab" aria-selected={tab === "artists"} onClick={() => switchTab("artists")}>Artists</button><button className={tab === "albums" ? "is-selected" : ""} role="tab" aria-selected={tab === "albums"} onClick={() => switchTab("albums")}>Albums</button></div>
		{tab === "playlists" && <section className="library-collection">{playlistsError && <p className="inline-error">{playlistsError}</p>}{playlistsLoading ? <div className="playlist-grid">{Array.from({ length: 6 }, (_, index) => <SkeletonPlaylistCard key={index} />)}</div> : <>{ownedPlaylists.length > 0 && <><div className="library-collection-heading"><span className="kicker">OWNED</span><h2>Your playlists</h2></div><div className="playlist-grid">{ownedPlaylists.map((playlist) => <PlaylistCard playlist={playlist} subtitle={playlist.type === "system" ? "Made for you" : `${playlist.itemCount} songs`} key={playlist.id} />)}</div></>}{followedPlaylists.length > 0 && <><div className="library-collection-heading"><span className="kicker">FOLLOWED</span><h2>Saved playlists</h2></div><div className="playlist-grid">{followedPlaylists.map((playlist) => <PlaylistCard playlist={playlist} subtitle={`Following - ${playlist.itemCount} songs`} key={playlist.id} />)}</div></>}{!playlists.length && <div className="empty-state"><h2>No playlists yet</h2><p>Make one, then add as many songs as you want.</p><button className="secondary-button" onClick={() => setCreatingPlaylist(true)}>Create playlist</button></div>}{playlistsNextCursor && <button className="secondary-button library-load-more" onClick={loadMorePlaylists} disabled={playlistsLoadingMore}>{playlistsLoadingMore ? "Loading playlists..." : "Load more playlists"}</button>}</>}</section>}
		{tab === "liked" && <section className="library-collection">{likesError && <p className="inline-error">{likesError}</p>}<div className="track-list"><div className="track-list-header"><span>#</span><span>Title</span><span>Album</span><span>Duration</span></div>{likesLoading ? Array.from({ length: 7 }, (_, index) => <SkeletonTrackRow key={index} />) : likedTracks.map((track, index) => <TrackRow track={track} key={track.id} index={index} contextQueue={likedTracks} context={{ type: "liked" }} onAddToPlaylist={setPlaylistTrack} />)}{!likesLoading && !likedTracks.length && <div className="empty-state"><h2>Your liked songs will appear here</h2><p>Tap the heart on any track to save it.</p></div>}</div>{likesNextCursor && <button className="secondary-button library-load-more" onClick={loadMoreLikes} disabled={likesLoadingMore}>{likesLoadingMore ? "Loading songs..." : "Load more liked songs"}</button>}</section>}
		{tab === "artists" && <section className="library-collection">{followedArtists.error && <p className="inline-error">{followedArtists.error}</p>}{followedArtists.loading ? <div className="artist-card-grid">{Array.from({ length: 6 }, (_, index) => <SkeletonPlaylistCard key={index} />)}</div> : <>{followedArtists.data.length ? <div className="artist-card-grid">{followedArtists.data.map((artist) => <ArtistCard key={artist.id} artist={artist} />)}</div> : <div className="empty-state"><h2>No followed artists yet</h2><p>Follow an artist to shape your daily and weekly discoveries.</p></div>}{followedArtists.nextCursor && <button className="secondary-button library-load-more" onClick={followedArtists.loadMore} disabled={followedArtists.loadingMore}>{followedArtists.loadingMore ? "Loading artists..." : "Load more artists"}</button>}</>}</section>}
		{tab === "albums" && <section className="library-collection">{savedAlbums.error && <p className="inline-error">{savedAlbums.error}</p>}{savedAlbums.loading ? <div className="album-grid">{Array.from({ length: 6 }, (_, index) => <SkeletonPlaylistCard key={index} />)}</div> : <>{savedAlbums.data.length ? <div className="album-grid">{savedAlbums.data.map((album) => <AlbumCard key={album.id} album={album} />)}</div> : <div className="empty-state"><h2>No saved albums yet</h2><p>Save an album to keep its full tracklist in your library.</p></div>}{savedAlbums.nextCursor && <button className="secondary-button library-load-more" onClick={savedAlbums.loadMore} disabled={savedAlbums.loadingMore}>{savedAlbums.loadingMore ? "Loading albums..." : "Load more albums"}</button>}</>}</section>}
		{playlistTrack && <AddToPlaylistModal track={playlistTrack} onClose={() => setPlaylistTrack(null)} onCreatePlaylist={() => { setPlaylistTrack(null); setCreatingPlaylist(true); }} />}
		{creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}
	</div>;
}
