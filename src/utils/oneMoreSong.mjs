import { normalizeRadioArtist } from "./radioSeed.mjs";
import { sameRadioSongFamily } from "./songIdentity.mjs";

export function shouldOfferOneMore({ armed, completed, radio, jamGuest } = {}) {
  return Boolean(armed && completed && radio && !jamGuest);
}

export function pickOneMoreTrack(
  candidates,
  {
    currentId,
    queuedIds,
    current = null,
    queue = [],
    history = [],
  } = {},
) {
  const queuedTracks = Array.isArray(queue) ? queue.filter(Boolean) : [];
  const recentHistory = (Array.isArray(history) ? history : []).filter(Boolean).slice(-8);
  const sessionTracks = [
    ...(current ? [current] : []),
    ...queuedTracks,
    ...recentHistory,
  ];
  const blocked = new Set([
    currentId,
    current?.id,
    ...(Array.isArray(queuedIds) ? queuedIds : []),
    ...queuedTracks.map((track) => track?.id),
  ].filter(Boolean));
  const excludedArtists = new Set(
    sessionTracks
      .map((track) => normalizeRadioArtist(track?.channel || track?.artist || ""))
      .filter(Boolean),
  );

  return (Array.isArray(candidates) ? candidates : []).find((item) => {
    if (!item?.id || blocked.has(item.id)) return false;
    const artist = normalizeRadioArtist(item.channel || item.artist || "");
    if (artist && excludedArtists.has(artist)) return false;
    if (sessionTracks.some((track) => sameRadioSongFamily(track, item))) return false;
    return true;
  }) || null;
}
