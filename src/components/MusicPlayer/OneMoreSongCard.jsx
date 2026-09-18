"use client";

export default function OneMoreSongCard({ track, onPlay, onDismiss }) {
  if (!track) return null;
  const canPlay = Boolean(track.id);
  return (
    <div className="one-more-card" role="dialog" aria-modal="true" aria-labelledby="one-more-title">
      <p className="one-more-kicker">One more song</p>
      <h2 id="one-more-title" className="one-more-title">
        {canPlay ? (track.title || "Related track") : "Radio paused after this track"}
      </h2>
      <p className="one-more-channel">
        {canPlay ? (track.channel || "YouTube") : "We couldn’t find a last related song."}
      </p>
      <div className="one-more-actions">
        {canPlay ? (
          <button type="button" className="btn-primary px-4 text-sm" onClick={() => onPlay(track)}>
            Play this last song
          </button>
        ) : null}
        <button type="button" className="btn-ghost px-4 text-sm" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
