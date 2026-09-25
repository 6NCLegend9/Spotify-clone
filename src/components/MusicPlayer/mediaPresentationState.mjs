export function resolveInitialMediaVideoMode(storedValue, canVideo) {
  if (!canVideo) return false;
  if (storedValue === "audio") return false;
  if (storedValue === "video") return true;
  return true;
}

export function shouldExposeLiveVideoViewport({
  showingVideo,
  mobile,
  entering,
  closing,
  dragY,
}) {
  if (!showingVideo) return false;
  if (!mobile) return true;
  if (entering || closing) return false;
  return !(Number(dragY) > 0);
}

export function resolveMediaVideoModeAfterCapabilityChange(storedValue, canVideo) {
  return resolveInitialMediaVideoMode(storedValue, canVideo);
}
