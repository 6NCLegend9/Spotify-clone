import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";
import { useToast } from "../context/ToastContext";
import { navigate } from "../hooks/useHashRoute";
import { shareTrack } from "../lib/share";
import { Icon } from "./Icon";

export function TrackCard({ track, index = 0, contextQueue, context, onAddToPlaylist }) {
  const { play, pause, isPlaying, track: current, addToQueue } = usePlayer();
  const { likedIds, toggleLike } = useLibrary();
  const { notify } = useToast();
  const active = current?.id === track.id && isPlaying;
  const isLiked = likedIds.has(track.id);
  const share = async () => {
    const result = await shareTrack(track);
    if (result.status === "shared") notify("Song shared", "success");
    else if (result.status === "copied") notify("Song link copied", "success");
    else if (result.status !== "cancelled") notify("Sharing is unavailable on this device", "error");
  };

  return <article className={`track-card reveal delay-${Math.min(index + 1, 3)}`}>
    <button className="track-card-cover" onClick={() => navigate(`/track/${track.id}`)}><img src={track.coverUrl} alt={`${track.title} cover`} /></button>
    <div className="track-card-body"><div><button className="track-card-title" onClick={() => navigate(`/track/${track.id}`)}><h3>{track.title}</h3><p>{track.artistName}</p></button><div className="track-card-actions"><button className="icon-button" aria-label={active ? `Pause ${track.title}` : `Play ${track.title}`} title={active ? "Pause" : "Play"} onClick={() => active ? pause() : play(track, contextQueue, index, context)}><Icon name={active ? "pause" : "play"} /></button><button className={`icon-button ${isLiked ? "is-liked" : ""}`} aria-label={isLiked ? `Remove ${track.title} from liked songs` : `Like ${track.title}`} title={isLiked ? "Remove from liked songs" : "Add to liked songs"} onClick={() => toggleLike(track).catch(() => undefined)}><Icon name="heart" filled={isLiked} /></button><button className="icon-button" aria-label={`Add ${track.title} to queue`} title="Add to queue" onClick={() => { addToQueue(track); notify("Added to queue", "success"); }}><Icon name="queue" /></button><button className="icon-button" aria-label={`Add ${track.title} to playlist`} title="Add to playlist" onClick={() => onAddToPlaylist?.(track)}><Icon name="plus" /></button><button className="icon-button" aria-label={`Share ${track.title}`} title="Share song" onClick={share}><Icon name="share" /></button></div></div></div>
  </article>;
}
