import { usePlayer } from "../context/PlayerContext";
import { useGeniusLyricsSource } from "../hooks/useGeniusLyricsSource";

export function LyricsPanel({ track: selectedTrack }) {
  const { track: currentTrack, progressSec } = usePlayer();
  const track = selectedTrack || currentTrack;
  const hasLyrics = Boolean(track?.lyricsText || track?.lyricsByTimestamp?.length);
  const { song: geniusSong, loading: geniusLoading, error: geniusError, lookup: lookupGenius } = useGeniusLyricsSource(track);
  const lines = track?.lyricsByTimestamp?.length ? track.lyricsByTimestamp : track?.lyricsText?.split("\n").map((text, index) => ({ startSec: index * 5, text })) || [];

  return <section className="lyrics-panel" aria-label={track?.title ? `Lyrics for ${track.title}` : "Lyrics"}>
    <div className="panel-title"><span className="kicker">LYRICS</span><h3>{track?.title || "No track selected"}</h3></div>
    {hasLyrics && <div className="lyrics-scroll">{lines.map((line, index) => {
      const nextLine = lines[index + 1];
      const active = currentTrack?.id === track.id && progressSec >= line.startSec && (!nextLine || progressSec < nextLine.startSec);
      return <p className={active ? "is-active-line" : ""} key={`${line.startSec}-${line.text}`}>{line.text}</p>;
    })}</div>}
    {!hasLyrics && <p className="empty-copy">{geniusLoading ? "Finding a lyrics source..." : geniusSong ? "Lyrics are available on Genius." : "Lyrics unavailable for this track."}</p>}
    {!geniusSong && <button type="button" className="text-button lyrics-source-trigger" onClick={lookupGenius} disabled={geniusLoading}>{geniusLoading ? "Finding Genius match..." : "Find lyrics on Genius"}</button>}
    {geniusError && <p className="empty-copy lyrics-source-error">{geniusError}</p>}
    {geniusSong && <div className="lyrics-source"><div><span className="kicker">SOURCE: GENIUS</span><strong>{geniusSong.fullTitle}</strong></div><a className="secondary-button" href={geniusSong.lyricsUrl} target="_blank" rel="noreferrer" aria-label={`Open ${geniusSong.fullTitle} on Genius`}>Open lyrics</a></div>}
  </section>;
}