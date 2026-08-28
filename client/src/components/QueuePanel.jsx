import { usePlayer } from "../context/PlayerContext";
import { Icon } from "./Icon";

export function QueuePanel() {
  const { queue, queueIndex, play, removeFromQueue, playbackContext } = usePlayer();
  const upcoming = queue.slice(queueIndex + 1);

  return <section className="queue-panel" aria-label="Up next queue">
    <div className="panel-title"><span className="kicker">UP NEXT</span><h3>Queue</h3></div>
    {upcoming.length ? <ol>{upcoming.map((item, offset) => {
      const index = queueIndex + offset + 1;
      return <li key={`${item.id}-${index}`}><button className="queue-track" onClick={() => play(item, queue, index, playbackContext)}><img src={item.coverUrl} alt="" /><span><strong>{item.title}</strong><small>{item.artistName}</small></span></button><button className="icon-button" aria-label={`Remove ${item.title} from queue`} title="Remove from queue" onClick={() => removeFromQueue(index)}><Icon name="close" /></button></li>;
    })}</ol> : <p className="empty-copy">Your queue is clear. Add a song to hear it next.</p>}
  </section>;
}