"use client";

import TrackQueueMenu from "@/components/TrackQueueMenu";

// Backward-compatible wrapper used across Search, playlists and recommendation cards.
// The control now exposes both Spotify-style queue actions: Play next and Add to queue.
export default function AddToQueueButton({ track, className = "", onRemove, removeLabel }) {
  return <TrackQueueMenu track={track} className={className} buttonLabel="Queue options" onRemove={onRemove} removeLabel={removeLabel} />;
}

