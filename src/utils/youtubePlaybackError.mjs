export function youtubePlaybackError(value) {
  const code = Number(value);
  if (code === 101 || code === 150) {
    return {
      code,
      canRetry: false,
      message: "YouTube does not allow this video to play here.",
      detail: "Choose another upload or open it on YouTube. HayKasa guest mode cannot remove this restriction.",
    };
  }
  if (code === 100) {
    return { code, canRetry: false, message: "This video is unavailable or private.", detail: "Search for another upload of this song." };
  }
  if (code === 153) {
    return { code, canRetry: true, message: "YouTube could not verify this player.", detail: "Try opening HayKasa in your browser, or open the video on YouTube." };
  }
  return {
    code,
    canRetry: true,
    message: code === 2 ? "YouTube could not load this video."
      : code === 5 ? "This video could not play in your browser." : "YouTube playback failed.",
    detail: "If YouTube asks you to sign in or confirm you are not a bot, open the video on YouTube. Signing in to HayKasa does not sign you in to YouTube.",
  };
}
