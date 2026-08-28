function canonicalTrackUrl(trackId) {
  return `${window.location.origin}${window.location.pathname}#/track/${encodeURIComponent(trackId)}`;
}

export async function shareTrack(track) {
  const url = canonicalTrackUrl(track.id);
  const payload = { title: track.title, text: `${track.title} by ${track.artistName}`, url };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return { status: "shared" };
    } catch (error) {
      if (error?.name === "AbortError") return { status: "cancelled" };
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return { status: "copied" };
    } catch {
      return { status: "error" };
    }
  }

  return { status: "error" };
}