import { useEffect, useRef, useState } from "react";
import { useHashRoute, navigate } from "../hooks/useHashRoute";
import { useSearch } from "../hooks/useSearch";
import { useGroupedSearch } from "../hooks/useGroupedSearch";
import { useYouTubeSearch } from "../hooks/useYouTubeSearch";
import { useLibrary } from "../context/LibraryContext";
import { api } from "../lib/api";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { AlbumCard } from "../components/AlbumCard";
import { ArtistCard } from "../components/ArtistCard";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { PlaylistCard } from "../components/PlaylistCard";
import { SkeletonTrackRow } from "../components/Skeletons";
import { TrackRow } from "../components/TrackRow";
import { YouTubeVideoCard } from "../components/YouTubeVideoCard";

export function Search() {
	const { query } = useHashRoute();
	const { likedIds, invalidateRecommendations } = useLibrary();
	const [genre, setGenre] = useState("");
	const [sort, setSort] = useState("relevance");
	const [likedOnly, setLikedOnly] = useState(false);
	const [resultType, setResultType] = useState("all");
	const [playlistTrack, setPlaylistTrack] = useState(null);
	const [creatingPlaylist, setCreatingPlaylist] = useState(false);
	const searchTerm = query.q || "";
	const trackSearch = useSearch(searchTerm, { genre, sort, limit: 40 });
	const groupedSearch = useGroupedSearch(searchTerm, 12);
	const youtubeSearch = useYouTubeSearch(searchTerm, 12);
	const genres = [...new Set([...trackSearch.genres, ...groupedSearch.genres])];
	const filteredResults = likedOnly ? trackSearch.results.filter((track) => likedIds.has(track.id)) : trackSearch.results;
	const loading = trackSearch.loading || groupedSearch.loading;
	const error = trackSearch.error || groupedSearch.error;
	const allResults = Boolean(filteredResults.length || groupedSearch.artists.length || groupedSearch.albums.length || groupedSearch.playlists.length);
	const selectedHasResults = resultType === "songs" ? filteredResults.length > 0 : resultType === "artists" ? groupedSearch.artists.length > 0 : resultType === "albums" ? groupedSearch.albums.length > 0 : groupedSearch.playlists.length > 0;
	const selectedResultLabel = resultType === "songs" ? "songs" : resultType === "artists" ? "artists" : resultType === "albums" ? "albums" : "playlists";
	const hasResults = resultType === "all" ? allResults : true;
	const recordedSearchRef = useRef("");

	useEffect(() => {
		setResultType("all");
		recordedSearchRef.current = "";
	}, [searchTerm]);

	useEffect(() => {
		const normalizedQuery = searchTerm.trim();
		if (!normalizedQuery || trackSearch.settledQuery !== searchTerm || groupedSearch.settledQuery !== searchTerm || recordedSearchRef.current === normalizedQuery) return;
		recordedSearchRef.current = normalizedQuery;
		api.post("/api/search-events", {
			queryText: normalizedQuery,
			queryType: "mixed",
			matchedGenres: genres.slice(0, 8),
			matchedArtists: groupedSearch.artists.slice(0, 8).map((artist) => artist.name),
		}).then(() => invalidateRecommendations()).catch(() => undefined);
	}, [genres, groupedSearch.artists, groupedSearch.settledQuery, invalidateRecommendations, searchTerm, trackSearch.settledQuery]);

	const showTracks = resultType === "all" || resultType === "songs";
	const showArtists = resultType === "all" || resultType === "artists";
	const showAlbums = resultType === "all" || resultType === "albums";
	const showPlaylists = resultType === "all" || resultType === "playlists";

	return <div className="search-view reveal">
		<div className="view-intro"><span className="kicker">SEARCH</span><h1>{searchTerm ? `Results for "${searchTerm}"` : "What do you want to hear?"}</h1><p>{searchTerm ? "Live music-video results from YouTube, plus real Spotify catalog matches." : "Search live YouTube music videos or browse the Spotify catalog."}</p></div>
		{searchTerm && <div className="search-filters"><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="relevance">Relevance</option><option value="popularity">Popularity</option><option value="newest">Newest</option></select></label><label className="check-row"><input type="checkbox" checked={likedOnly} onChange={(event) => setLikedOnly(event.target.checked)} /><span>Liked only</span></label></div>}
		{genres.length > 0 && <div className="genre-chips" aria-label="Genre filters"><button className={!genre ? "is-selected" : ""} onClick={() => setGenre("")}>All</button>{genres.map((item) => <button className={genre === item ? "is-selected" : ""} key={item} onClick={() => setGenre(item)}>{item}</button>)}</div>}
		{error && <p className="inline-error">{error}</p>}
		{searchTerm && <section className="search-result-section youtube-search-results"><div className="section-heading"><div><span className="kicker">LIVE FROM YOUTUBE</span><h2>Music videos</h2></div>{!youtubeSearch.loading && <span>{youtubeSearch.videos.length} matches</span>}</div>{youtubeSearch.loading && <div className="youtube-video-grid">{Array.from({ length: 4 }, (_, index) => <div className="skeleton-cover" key={index} />)}</div>}{youtubeSearch.error && <p className="inline-error">{youtubeSearch.error}</p>}{!youtubeSearch.loading && !youtubeSearch.error && !youtubeSearch.videos.length && <p className="empty-search-copy">No embeddable YouTube music videos matched this search.</p>}{!youtubeSearch.loading && youtubeSearch.videos.length > 0 && <div className="youtube-video-grid">{youtubeSearch.videos.map((video, index) => <YouTubeVideoCard key={video.id} video={video} index={index} />)}</div>}</section>}
		{searchTerm && <div className="search-result-tabs" role="tablist" aria-label="Search result type"><button className={resultType === "all" ? "is-selected" : ""} role="tab" aria-selected={resultType === "all"} onClick={() => setResultType("all")}>All</button><button className={resultType === "songs" ? "is-selected" : ""} role="tab" aria-selected={resultType === "songs"} onClick={() => setResultType("songs")}>Songs</button><button className={resultType === "artists" ? "is-selected" : ""} role="tab" aria-selected={resultType === "artists"} onClick={() => setResultType("artists")}>Artists</button><button className={resultType === "albums" ? "is-selected" : ""} role="tab" aria-selected={resultType === "albums"} onClick={() => setResultType("albums")}>Albums</button><button className={resultType === "playlists" ? "is-selected" : ""} role="tab" aria-selected={resultType === "playlists"} onClick={() => setResultType("playlists")}>Playlists</button></div>}
		{loading && searchTerm && <section className="track-list">{Array.from({ length: 7 }, (_, index) => <SkeletonTrackRow key={index} />)}</section>}
		{!loading && searchTerm && resultType !== "all" && !selectedHasResults && <section className="empty-state"><h2>No matching {selectedResultLabel}</h2><p>Try another tab or adjust the search and filters.</p></section>}
		{!loading && searchTerm && <>{showTracks && filteredResults.length > 0 && <section className="search-result-section"><div className="section-heading"><div><span className="kicker">SONGS</span><h2>{resultType === "songs" ? "Matching songs" : "Songs"}</h2></div><span>{filteredResults.length} matches</span></div><div className="track-list"><div className="track-list-header"><span>#</span><span>Title</span><span>Album</span><span>Duration</span></div>{filteredResults.map((track, index) => <TrackRow key={track.id} track={track} index={index} contextQueue={filteredResults} context={{ type: "search", refId: searchTerm }} onAddToPlaylist={setPlaylistTrack} />)}</div></section>}{showArtists && groupedSearch.artists.length > 0 && <section className="search-result-section"><div className="section-heading"><div><span className="kicker">ARTISTS</span><h2>{resultType === "artists" ? "Matching artists" : "Artists"}</h2></div><span>{groupedSearch.artists.length} matches</span></div><div className="artist-card-grid">{groupedSearch.artists.map((artist) => <ArtistCard key={artist.id} artist={artist} />)}</div></section>}{showAlbums && groupedSearch.albums.length > 0 && <section className="search-result-section"><div className="section-heading"><div><span className="kicker">ALBUMS</span><h2>{resultType === "albums" ? "Matching albums" : "Albums"}</h2></div><span>{groupedSearch.albums.length} matches</span></div><div className="album-grid">{groupedSearch.albums.map((album) => <AlbumCard key={album.id} album={album} />)}</div></section>}{showPlaylists && groupedSearch.playlists.length > 0 && <section className="search-result-section"><div className="section-heading"><div><span className="kicker">PLAYLISTS</span><h2>{resultType === "playlists" ? "Matching playlists" : "Playlists"}</h2></div><span>{groupedSearch.playlists.length} matches</span></div><div className="playlist-grid">{groupedSearch.playlists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} subtitle={playlist.isOwner ? `${playlist.itemCount} songs` : `Public playlist - ${playlist.itemCount} songs`} />)}</div></section>}{!hasResults && <div className="empty-state"><h2>{likedOnly ? "No liked matches" : "Nothing matched yet"}</h2><p>Try another artist, genre, album, or song title.</p></div>}</>}
		{!searchTerm && <section className="empty-state search-empty"><h2>Search the catalog</h2><p>Try a genre such as Hip-Hop, Electronic, Jazz, or a favorite artist.</p><button className="secondary-button" onClick={() => navigate("/genre/Hip-Hop")}>Browse Hip-Hop</button></section>}
		{playlistTrack && <AddToPlaylistModal track={playlistTrack} onClose={() => setPlaylistTrack(null)} onCreatePlaylist={() => { setPlaylistTrack(null); setCreatingPlaylist(true); }} />}
		{creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}
	</div>;
}
