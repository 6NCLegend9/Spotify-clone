function cleanText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function sanitizePlaybackState(value) {
  if (!value || typeof value !== "object") {
    return {
      hasTrack: false,
      playing: false,
      canPlay: false,
      canSkip: false,
      canPrev: false,
      title: "",
      artist: "",
      artwork: "",
    };
  }
  const artwork = String(value.artwork || "").trim();
  const hasTrack = value.hasTrack === true;
  return {
    hasTrack,
    playing: value.playing === true,
    canPlay: hasTrack && value.canPlay === true,
    canSkip: hasTrack && value.canSkip === true,
    canPrev: hasTrack && value.canPrev === true,
    title: cleanText(value.title, 120),
    artist: cleanText(value.artist, 120),
    artwork: /^https:\/\//i.test(artwork) ? artwork.slice(0, 500) : "",
  };
}

export function isPlaybackCommand(value) {
  return value === "play-pause" || value === "skip" || value === "prev";
}
