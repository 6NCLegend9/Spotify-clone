import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";
import { usePlayer } from "../context/PlayerContext";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { Icon } from "../components/Icon";
import { SkeletonTrackRow } from "../components/Skeletons";
import { StartRadioButton } from "../components/StartRadioButton";
import { TrackRow } from "../components/TrackRow";

const chartWindows = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "Weekly Top" },
  { value: "trending", label: "Trending" },
  { value: "new-releases", label: "New releases" },
];

export function Charts() {
  const { play } = usePlayer();
  const [windowType, setWindowType] = useState("weekly");
  const [title, setTitle] = useState("Weekly Top Songs");
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playlistTrack, setPlaylistTrack] = useState(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get(withQuery("/api/charts", { window: windowType, limit: 50 }));
        if (!active) return;
        setTitle(response.title || "Charts");
        setTracks(response.data || []);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError.message || "Charts are unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [windowType]);

  return <div className="charts-view reveal">
    <section className="view-intro charts-intro"><span className="kicker">EDITORIAL</span><h1>{title}</h1><p>Catalog-driven rankings shaped by recent listening activity, release freshness, and stable popularity signals.</p><div className="catalog-actions"><button className="primary-button" onClick={() => tracks.length && play(tracks[0], tracks, 0, { type: "home", refId: `charts:${windowType}` })} disabled={!tracks.length}><Icon name="play" />Play chart</button>{tracks[0] && <StartRadioButton seedType="track" seedId={tracks[0].id}>Top song radio</StartRadioButton>}</div></section>
    <div className="chart-tabs" role="tablist" aria-label="Chart window">{chartWindows.map((item) => <button key={item.value} role="tab" aria-selected={windowType === item.value} className={windowType === item.value ? "is-selected" : ""} onClick={() => setWindowType(item.value)}>{item.label}</button>)}</div>
    {error && <p className="inline-error">{error}</p>}
    <section className="songs-panel chart-panel"><div className="songs-panel-heading"><div><span className="kicker">TOP 50</span><h2>{title}</h2></div><span>{loading ? "Updating" : `${tracks.length} tracks`}</span></div><div className="track-list"><div className="track-list-header"><span>#</span><span>Title</span><span>Album</span><span>Duration</span></div>{loading ? Array.from({ length: 10 }, (_, index) => <SkeletonTrackRow key={index} />) : tracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} contextQueue={tracks} context={{ type: "home", refId: `charts:${windowType}` }} onAddToPlaylist={setPlaylistTrack} />)}{!loading && !tracks.length && <div className="empty-state"><h2>No chart entries yet</h2><p>Play a few songs and return for a refreshed ranking.</p></div>}</div></section>
    {playlistTrack && <AddToPlaylistModal track={playlistTrack} onClose={() => setPlaylistTrack(null)} onCreatePlaylist={() => { setPlaylistTrack(null); setCreatingPlaylist(true); }} />}
    {creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}
  </div>;
}