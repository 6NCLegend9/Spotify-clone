export function shouldHoldPlaybackWakeLock({
  isPlaying = false,
  mediaTheater = false,
  videoVisible = false,
} = {}) {
  return Boolean(isPlaying && mediaTheater && videoVisible);
}
