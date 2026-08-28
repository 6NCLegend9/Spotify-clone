import { useLibrary } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ToastContext";
import { formatDuration } from "../lib/format";
import { shareTrack } from "../lib/share";
import { navigate } from "../hooks/useHashRoute";
import { Icon } from "./Icon";

export function TrackRow({ track, index = 0, contextQueue, context, onAddToPlaylist, onRemoveFromPlaylist, removingFromPlaylist = false }) {
  const { track: currentTrack, isPlaying, pause, play, addToQueue } = usePlayer();
  const { likedIds, toggleLike } = useLibrary();
  const { notify } = useToast();
  const isCurrent = currentTrack?.id === track.id;
  const isLiked = likedIds.has(track.id);

  const handleShare = async () => {
    const result = await shareTrack(track);
    if (result.status === "shared") notify("Song shared", "success");
    else if (result.status === "copied") notify("Song link copied", "success");
    else if (result.status === "cancelled") notify("Share cancelled");
    else notify("Sharing is unavailable on this device", "error");
  };

  return <article className={`track-row ${isCurrent ? "is-current" : ""}`} aria-current={isCurrent ? "true" : undefined}>
    <button className="track-index" aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`} title={isCurrent && isPlaying ? "Pause" : "Play"} onClick={() => isCurrent && isPlaying ? pause() : play(track, contextQueue, index, context)}>
      {isCurrent && isPlaying ? <Icon name="pause" /> : <><span className="track-number">{index + 1}</span><Icon name="play" /></>}
    </button>
    <button className="track-summary" onClick={() => navigate(`/track/${track.id}`)}>
      <img src={track.coverUrl} alt="" />
      <span><strong>{track.title}</strong><small>{track.artistName}</small></span>
    </button>
    <span className="track-album">{track.albumName}</span>
    <span className="track-duration">{formatDuration(track.durationSec)}</span>
    <div className="track-actions">
      {onRemoveFromPlaylist && <button className="icon-button playlist-remove-button" aria-label={`Remove ${track.title} from this playlist`} title="Remove from playlist" disabled={removingFromPlaylist} onClick={() => onRemoveFromPlaylist(track)}><Icon name={removingFromPlaylist ? "loading" : "trash"} /></button>}
      <button className={`icon-button ${isLiked ? "is-liked" : ""}`} aria-label={isLiked ? `Remove ${track.title} from liked songs` : `Like ${track.title}`} title={isLiked ? "Remove from liked songs" : "Add to liked songs"} onClick={() => toggleLike(track).catch(() => undefined)}><Icon name="heart" filled={isLiked} /></button>
      <button className="icon-button" aria-label={`Add ${track.title} to queue`} title="Add to queue" onClick={() => { addToQueue(track); notify("Added to queue", "success"); }}><Icon name="queue" /></button>
      <button className="icon-button" aria-label={`Add ${track.title} to a playlist`} title="Add to playlist" onClick={() => onAddToPlaylist?.(track)}><Icon name="plus" /></button>
      <button className="icon-button" aria-label={`Share ${track.title}`} title="Share song" onClick={handleShare}><Icon name="share" /></button>
    </div>
  </article>;
}