import { useEffect, useState } from "react";
import { useHashRoute, navigate } from "../hooks/useHashRoute";
import { useLibrary } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import { formatDuration } from "../lib/format";
import { shareTrack } from "../lib/share";
import { AddToPlaylistModal } from "../components/AddToPlaylistModal";
import { CreatePlaylistModal } from "../components/CreatePlaylistModal";
import { Icon } from "../components/Icon";
import { LyricsPanel } from "../components/LyricsPanel";
import { StartRadioButton } from "../components/StartRadioButton";
import { VideoPanel } from "../components/VideoPanel";

export function TrackDetail() {
  const { params, query } = useHashRoute();
  const { track: currentTrack, isPlaying, pause, play, addToQueue } = usePlayer();
  const { likedIds, toggleLike } = useLibrary();
  const { notify } = useToast();
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("lyrics");
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/api/tracks/${params.id}`);
        if (active) {
          setTrack(response.data);
          setError("");
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [params.id]);

  useEffect(() => {
    setTab(query.panel === "video" ? "video" : "lyrics");
  }, [params.id, query.panel]);

  const share = async () => {
    const result = await shareTrack(track);
    if (result.status === "shared") notify("Song shared", "success");
    else if (result.status === "copied") notify("Song link copied", "success");
    else if (result.status === "cancelled") notify("Share cancelled");
    else notify("Sharing is unavailable on this device", "error");
  };

  const toggleMusicVideo = () => {
    if (tab === "video") {
      setTab("lyrics");
      return;
    }
    if (isPlaying) pause();
    setTab("video");
  };

  if (loading) return <div className="track-detail reveal"><div className="track-detail-hero skeleton-summary" /><div className="lyrics-panel"><p>Loading track details...</p></div></div>;
  if (error || !track) return <div className="empty-state reveal"><h1>Track unavailable</h1><p>{error || "This track could not be found."}</p><button className="secondary-button" onClick={() => navigate("/")}>Back home</button></div>;
  const active = currentTrack?.id === track.id && isPlaying;
  const liked = likedIds.has(track.id);
  const isSpotifyTrack = track.provider === "spotify" && Boolean(track.spotifyId);
  const playOfficialVideo = () => navigate(`/track/${track.id}?panel=video&autoplay=1`);

  return <div className="track-detail reveal">
    <section className="track-detail-hero"><img src={track.coverUrl} alt={`${track.title} cover`} /><div><span className="kicker">{isSpotifyTrack ? "SPOTIFY" : "TRACK"}</span><h1>{track.title}</h1><p className="track-metadata">{track.artistId ? <button type="button" onClick={() => navigate(`/artist/${track.artistId}`)}>{track.artistName}</button> : track.artistName} <span>•</span> {track.albumId ? <button type="button" onClick={() => navigate(`/album/${track.albumId}`)}>{track.albumName}</button> : track.albumName}</p><small>{track.genres.length > 0 && <>{track.genres.join(" / ")} <span>•</span> </>}{formatDuration(track.durationSec)}</small><div className="track-detail-actions"><button className="primary-button" onClick={() => isSpotifyTrack ? playOfficialVideo() : active ? pause() : play(track, [track], 0, { type: "queue" })}><Icon name={active ? "pause" : "play"} />{active ? "Pause" : "Play"}</button><button type="button" className={`secondary-button music-video-toggle ${tab === "video" ? "is-selected" : ""}`} aria-pressed={tab === "video"} onClick={toggleMusicVideo}><Icon name="video" />{tab === "video" ? "Hide video" : "Music video"}</button><button className={`icon-button ${liked ? "is-liked" : ""}`} aria-label={liked ? "Remove from liked songs" : "Add to liked songs"} title={liked ? "Remove from liked songs" : "Add to liked songs"} onClick={() => toggleLike(track).catch(() => undefined)}><Icon name="heart" filled={liked} /></button><button className="icon-button" aria-label="Add to queue" title="Add to queue" onClick={() => { addToQueue(track); notify("Added to queue", "success"); }}><Icon name="queue" /></button><button className="icon-button" aria-label="Add to playlist" title="Add to playlist" onClick={() => setAddingToPlaylist(true)}><Icon name="plus" /></button><button className="icon-button" aria-label="Share song" title="Share song" onClick={share}><Icon name="share" /></button><StartRadioButton seedType="track" seedId={track.id}>Song radio</StartRadioButton></div></div></section>
    <div className="detail-tabs"><button className={tab === "lyrics" ? "is-selected" : ""} onClick={() => setTab("lyrics")}><Icon name="lyrics" />Lyrics</button><button className={tab === "video" ? "is-selected" : ""} onClick={toggleMusicVideo}><Icon name="video" />Video</button></div>
    {tab === "lyrics" ? <LyricsPanel track={track} /> : <VideoPanel track={track} autoPlay={query.autoplay === "1"} />}
    {addingToPlaylist && <AddToPlaylistModal track={track} onClose={() => setAddingToPlaylist(false)} onCreatePlaylist={() => { setAddingToPlaylist(false); setCreatingPlaylist(true); }} />}
    {creatingPlaylist && <CreatePlaylistModal onClose={() => setCreatingPlaylist(false)} />}
  </div>;
}