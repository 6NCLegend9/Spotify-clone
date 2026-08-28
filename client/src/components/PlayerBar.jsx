import { useEffect, useState } from "react";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ToastContext";
import { useUser } from "../context/UserContext";
import { navigate } from "../hooks/useHashRoute";
import { getPlaybackDevice } from "../lib/devices";
import { formatDuration } from "../lib/format";
import { shareTrack } from "../lib/share";
import { Icon } from "./Icon";
import { LyricsPanel } from "./LyricsPanel";
import { QueuePanel } from "./QueuePanel";

export function PlayerBar() {
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState("queue");
  const { track, isPlaying, play, pause, previous, next, seek, progressSec, durationSec, volume, muted, toggleMuted, setVolume, shuffle, setShuffle, repeatMode, setRepeatMode, queue, qualityEffective, keyboardShortcutsEnabled, closePlayer } = usePlayer();
  const { user } = useUser();
  const { notify } = useToast();
  const activeDevice = getPlaybackDevice(user?.settings?.activeDeviceId);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (!keyboardShortcutsEnabled || event.target.matches("input, textarea, select, button")) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (track) isPlaying ? pause() : play(track);
      }
      if (event.code === "ArrowRight" && track) seek(progressSec + 5);
      if (event.code === "ArrowLeft" && track) seek(progressSec - 5);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [keyboardShortcutsEnabled, track, isPlaying, progressSec]);

  const cycleRepeat = () => setRepeatMode(repeatMode === "off" ? "context" : repeatMode === "context" ? "one" : "off");
  const share = async () => {
    const result = await shareTrack(track);
    if (result.status === "shared") notify("Song shared", "success");
    else if (result.status === "copied") notify("Song link copied", "success");
    else if (result.status === "cancelled") notify("Share cancelled");
    else notify("Sharing is unavailable on this device", "error");
  };

  if (!track) return <div className="player-bar empty-player"><span>Select a track to start listening</span></div>;
  const progress = Math.min(progressSec, durationSec || 0);

  return <footer className={`player-bar ${expanded ? "is-expanded" : ""}`}>
    <button className="now-playing" onClick={() => navigate(`/track/${track.id}`)}><img src={track.coverUrl} alt="" /><span><strong>{track.title}</strong><small>{track.artistName}</small></span></button>
    <div className="player-center">
      <div className="player-controls"><button className={`icon-button ${shuffle ? "is-active" : ""}`} aria-label="Toggle shuffle" title="Shuffle" onClick={() => setShuffle(!shuffle)}><Icon name="shuffle" /></button><button className="icon-button" aria-label="Previous track" title="Previous" onClick={previous}><Icon name="previous" /></button><button className="play-control" aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause" : "Play"} onClick={() => isPlaying ? pause() : play(track)}><Icon name={isPlaying ? "pause" : "play"} /></button><button className="icon-button" aria-label="Next track" title="Next" onClick={() => next()}><Icon name="next" /></button><button className={`icon-button ${repeatMode !== "off" ? "is-active" : ""}`} aria-label={`Repeat mode: ${repeatMode}`} title={`Repeat: ${repeatMode}`} onClick={cycleRepeat}><Icon name="repeat" />{repeatMode === "one" && <sup>1</sup>}</button></div>
      <div className="progress-control"><span>{formatDuration(progress)}</span><input aria-label="Seek through current song" type="range" min="0" max={Math.max(durationSec, 1)} step="0.01" value={progress} onChange={(event) => seek(Number(event.target.value))} /><span>{formatDuration(durationSec)}</span></div>
    </div>
    <div className="player-utilities"><span className="device-indicator" title={`Playing on ${activeDevice.name}`}><Icon name="device" size={14} />{activeDevice.name}</span><span className="quality-indicator">Quality: {qualityEffective}</span><button className="icon-button" aria-label="Share song" title="Share song" onClick={share}><Icon name="share" /></button><button className="icon-button" aria-label={muted || volume === 0 ? "Unmute" : "Mute"} title={muted || volume === 0 ? "Unmute" : "Mute"} onClick={toggleMuted}><Icon name={muted || volume === 0 ? "mute" : "volume"} /></button><label className="volume-control"><input aria-label={`Volume ${Math.round(volume * 100)} percent`} type="range" min="0" max="1" step=".01" value={muted ? 0 : volume} onChange={(event) => setVolume(Number(event.target.value))} /><output>{Math.round((muted ? 0 : volume) * 100)}%</output></label><button className="icon-button" aria-label="Show queue and lyrics" title="Queue and lyrics" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><Icon name="queue" /></button><button className="icon-button close-player" aria-label="Close player" title="Close player" onClick={closePlayer}><Icon name="close" /></button></div>
    {expanded && <div className="player-drawer"><div className="drawer-tabs"><button className={panel === "queue" ? "is-selected" : ""} onClick={() => setPanel("queue")}>Queue ({Math.max(0, queue.length - 1)})</button><button className={panel === "lyrics" ? "is-selected" : ""} onClick={() => setPanel("lyrics")}>Lyrics</button></div>{panel === "queue" ? <QueuePanel /> : <LyricsPanel track={track} />}</div>}
  </footer>;
}
