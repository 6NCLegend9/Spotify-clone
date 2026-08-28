import { useState } from "react";
import { useRecommendations } from "../hooks/useRecommendations";
import { useSearch } from "../hooks/useSearch";
import { usePagedCollection } from "../hooks/usePagedCollection";
import { useYouTubeTrending } from "../hooks/useYouTubeSearch";
import { useLibrary } from "../context/LibraryContext";
import { useUser } from "../context/UserContext";
import { navigate } from "../hooks/useHashRoute";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { PlaylistCard } from "../components/PlaylistCard";
import { SkeletonCover, SkeletonPlaylistCard } from "../components/Skeletons";
import { TrackCard } from "../components/TrackCard";
import { YouTubeVideoCard } from "../components/YouTubeVideoCard";

function RecommendationSection({ kicker, title, recommendations, loading, onAddToPlaylist, context }) {
	if (!loading && !recommendations.length) return null;

	return <section className="section reveal">
		<div className="section-heading"><div><span className="kicker">{kicker}</span><h2>{title}</h2></div></div>
		<div className="track-grid">{loading ? Array.from({ length: 4 }, (_, index) => <SkeletonCover key={index} />) : recommendations.map((track, index) => <div className="recommendation-wrap" key={track.id}><TrackCard track={track} index={index} contextQueue={recommendations} context={context} onAddToPlaylist={onAddToPlaylist} />{track.recommendationReason && <small className="recommendation-reason">{track.recommendationReason}</small>}</div>)}</div>
	</section>;
}

export function Home() {
	const { recommendationRevision } = useLibrary();
	const { user } = useUser();
	const [playlistTrack, setPlaylistTrack] = useState(null);
	const [creatingPlaylist, setCreatingPlaylist] = useState(false);
	const { results: catalog, loading: catalogLoading } = useSearch("", { sort: "popularity", limit: 8 });
	const youtubeTrending = useYouTubeTrending(8);
	const continueListening = usePagedCollection("/api/recommendations/continue-listening", {}, { pageSize: 8 });
	const trending = usePagedCollection("/api/charts", { window: "trending" }, { pageSize: 8 });
	const newReleases = usePagedCollection("/api/charts", { window: "new-releases" }, { pageSize: 8 });
	const daily = useRecommendations("daily", 8, recommendationRevision);
	const weeklyNew = useRecommendations("weekly-new", 8, recommendationRevision);
	const weeklyYours = useRecommendations("weekly-yours", 8, recommendationRevision);
	const becauseYouLike = daily.recommendations.slice(0, 4);
	const becauseYouListen = weeklyYours.recommendations.slice(0, 4);
	const topGenre = user?.tasteProfile?.topGenres?.[0]?.genre || "your favorites";
	const likeReason = becauseYouLike[0]?.recommendationReason || "Because you like these sounds";
	const weeklyPlaylists = [
		weeklyNew.playlist && { ...weeklyNew.playlist, subtitle: "Updated this week" },
		weeklyYours.playlist && { ...weeklyYours.playlist, subtitle: "Updated this week" },
	].filter(Boolean);

	return <div className="home-view">
		<section className="hero reveal">
			<div className="hero-copy"><span className="kicker">YOUR DAILY SOUNDTRACK</span><h1>Find your next<br /><em>favorite sound.</em></h1><p>Real Spotify catalog metadata, with live music-video discovery from YouTube.</p><button className="primary-button" onClick={() => navigate("/search")}>Explore music videos</button></div>
			<div className="hero-orbit" aria-hidden="true"><div className="orbit-disc"><span>M</span></div><i /><b /></div>
		</section>
		<section className="section reveal"><div className="section-heading"><div><span className="kicker">LIVE FROM YOUTUBE</span><h2>Trending music videos</h2></div><button className="text-button" onClick={() => navigate("/search")}>Search music</button></div>{youtubeTrending.loading && <div className="youtube-video-grid">{Array.from({ length: 4 }, (_, index) => <SkeletonCover key={index} />)}</div>}{youtubeTrending.error && <p className="inline-error">{youtubeTrending.error}</p>}{!youtubeTrending.loading && !youtubeTrending.error && <div className="youtube-video-grid">{youtubeTrending.videos.map((video, index) => <YouTubeVideoCard key={video.id} video={video} index={index} />)}</div>}</section>
		<RecommendationSection kicker="PICK UP WHERE YOU LEFT OFF" title="Continue listening" recommendations={continueListening.data} loading={continueListening.loading} context={{ type: "home" }} onAddToPlaylist={setPlaylistTrack} />
		<RecommendationSection kicker="UPDATED TODAY" title="Daily picks" recommendations={daily.recommendations} loading={daily.loading} context={{ type: "home" }} onAddToPlaylist={setPlaylistTrack} />
		<section className="section reveal">
			<div className="section-heading"><div><span className="kicker">WEEKLY DISCOVERY</span><h2>Made for your momentum</h2></div></div>
			<div className="playlist-grid">{(weeklyNew.loading || weeklyYours.loading) && !weeklyPlaylists.length ? Array.from({ length: 2 }, (_, index) => <SkeletonPlaylistCard key={index} />) : weeklyPlaylists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} subtitle={playlist.subtitle} />)}</div>
		</section>
		<RecommendationSection kicker="TRENDING NOW" title="Trending" recommendations={trending.data} loading={trending.loading} context={{ type: "home" }} onAddToPlaylist={setPlaylistTrack} />
		<RecommendationSection kicker="JUST IN" title="New releases" recommendations={newReleases.data} loading={newReleases.loading} context={{ type: "home" }} onAddToPlaylist={setPlaylistTrack} />
		<RecommendationSection kicker="FOR YOU" title={likeReason} recommendations={becauseYouLike} loading={daily.loading} context={{ type: "home" }} onAddToPlaylist={setPlaylistTrack} />
		<RecommendationSection kicker="FOR YOUR TASTE" title={`Because you listen to ${topGenre}`} recommendations={becauseYouListen} loading={weeklyYours.loading} context={{ type: "home" }} onAddToPlaylist={setPlaylistTrack} />
		<RecommendationSection kicker="FOR YOUR TASTE" title="Your discoveries" recommendations={weeklyYours.recommendations} loading={weeklyYours.loading} context={{ type: "home" }} onAddToPlaylist={setPlaylistTrack} />
		<section className="section reveal">
			<div className="section-heading"><div><span className="kicker">CHARTING NOW</span><h2>Popular on Spotify</h2></div><button className="text-button" onClick={() => navigate("/search")}>Browse all</button></div>
			<div className="track-grid">{catalogLoading ? Array.from({ length: 4 }, (_, index) => <SkeletonCover key={index} />) : catalog.slice(0, 4).map((track, index) => <TrackCard key={track.id} track={track} index={index} contextQueue={catalog} context={{ type: "home" }} onAddToPlaylist={setPlaylistTrack} />)}</div>
		</section>
		{playlistTrack && <AddToPlaylistModal track={playlistTrack} onClose={() => setPlaylistTrack(null)} onCreatePlaylist={() => { setPlaylistTrack(null); setCreatingPlaylist(true); }} />}
		{creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}
	</div>;
}
