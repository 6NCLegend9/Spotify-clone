import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";
import { navigate, useHashRoute } from "../hooks/useHashRoute";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ToastContext";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { Icon } from "../components/Icon";
import { SkeletonCover, SkeletonTrackRow } from "../components/Skeletons";
import { StartRadioButton } from "../components/StartRadioButton";
import { TrackRow } from "../components/TrackRow";

export function RadioStation() {
  const { params } = useHashRoute();
  const { play, closePlayer, track: currentTrack, playbackContext, addToQueue } = usePlayer();
  const { notify } = useToast();
  const [session, setSession] = useState(null);
  const [queue, setQueue] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [changing, setChanging] = useState(false);
  const [playlistTrack, setPlaylistTrack] = useState(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [sessionResponse, queueResponse] = await Promise.all([
          api.get(`/api/radio/sessions/${params.id}`),
          api.get(withQuery(`/api/radio/sessions/${params.id}/queue`, { limit: 25 })),
        ]);
        if (!active) return;
        setSession(sessionResponse.data);
        setQueue(queueResponse.data || []);
        setNextCursor(queueResponse.nextCursor || null);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError.message || "Radio is unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [params.id]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || !session) return;
    setLoadingMore(true);
    try {
      const response = await api.get(withQuery(`/api/radio/sessions/${session.id}/queue`, { limit: 25, cursor: nextCursor }));
      const additions = response.data || [];
      setQueue((current) => [...current, ...additions.filter((track) => !current.some((existing) => existing.id === track.id && existing.radioPosition === track.radioPosition))]);
      setNextCursor(response.nextCursor || null);
      if (playbackContext.type === "radio" && playbackContext.refId === session.id) additions.forEach(addToQueue);
    } catch (requestError) {
      notify(requestError.message || "Unable to extend this radio queue", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const currentQueueIndex = currentTrack ? queue.findIndex((track) => track.id === currentTrack.id) : -1;
  useEffect(() => {
    if (currentQueueIndex >= 0 && currentQueueIndex >= queue.length - 6) loadMore();
  }, [currentQueueIndex, queue.length, nextCursor, loadingMore, session?.id]);

  const stopRadio = async () => {
    if (!session || stopping) return;
    setStopping(true);
    try {
      await api.post(`/api/radio/sessions/${session.id}/stop`);
      if (playbackContext.type === "radio" && playbackContext.refId === session.id) closePlayer();
      notify("Radio station stopped");
      navigate("/charts");
    } catch (requestError) {
      notify(requestError.message || "Unable to stop radio", "error");
      setStopping(false);
    }
  };

  if (loading) return <div className="radio-view reveal"><section className="catalog-hero"><SkeletonCover /><div className="catalog-hero-copy"><span className="skeleton-line wide" /><span className="skeleton-line" /></div></section><section className="track-list">{Array.from({ length: 10 }, (_, index) => <SkeletonTrackRow key={index} />)}</section></div>;
  if (error || !session) return <div className="empty-state reveal"><h1>Radio unavailable</h1><p>{error || "This station could not be found."}</p><button className="secondary-button" onClick={() => navigate("/charts")}>Browse charts</button></div>;

  return <div className="radio-view reveal">
    <section className="catalog-hero radio-hero"><img src={session.coverUrl || "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800&q=80"} alt="" /><div className="catalog-hero-copy"><span className="kicker">CONTINUOUS STATION</span><h1>{session.name}</h1><p>{session.description}</p><small>{queue.length} songs lined up <span>•</span> Built from a {session.seedType} seed</small><div className="catalog-actions"><button className="primary-button" disabled={!queue.length} onClick={() => queue.length && play(queue[0], queue, 0, { type: "radio", refId: session.id })}><Icon name="play" />Play station</button><button className="secondary-button" onClick={stopRadio} disabled={stopping}><Icon name="close" />{stopping ? "Stopping..." : "Stop radio"}</button><button className="text-button" onClick={() => setChanging((value) => !value)}>{changing ? "Hide stations" : "Change station"}</button></div></div></section>
    {changing && <section className="radio-change section"><div className="section-heading"><div><span className="kicker">NEW SEED</span><h2>Try another station</h2></div></div><div className="radio-seed-options">{queue.slice(1, 7).map((track) => <div key={track.radioPosition} className="radio-seed-option"><img src={track.coverUrl} alt="" /><span><strong>{track.title}</strong><small>{track.artistName}</small></span><StartRadioButton seedType="track" seedId={track.id} className="icon-button" iconOnly ariaLabel={`Start radio from ${track.title}`} title={`Start radio from ${track.title}`} /></div>)}</div></section>}
    <section className="songs-panel radio-queue-panel"><div className="songs-panel-heading"><div><span className="kicker">UP NEXT</span><h2>Station queue</h2></div><span>{loadingMore ? "Adding more songs..." : "Continuously refreshed"}</span></div><div className="track-list"><div className="track-list-header"><span>#</span><span>Title</span><span>Album</span><span>Duration</span></div>{queue.map((track, index) => <TrackRow key={`${track.id}-${track.radioPosition}`} track={track} index={index} contextQueue={queue} context={{ type: "radio", refId: session.id }} onAddToPlaylist={setPlaylistTrack} />)}</div>{nextCursor && <button className="secondary-button load-more-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Adding tracks..." : "Load more"}</button>}</section>
    {playlistTrack && <AddToPlaylistModal track={playlistTrack} onClose={() => setPlaylistTrack(null)} onCreatePlaylist={() => { setPlaylistTrack(null); setCreatingPlaylist(true); }} />}
    {creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}
  </div>;
}