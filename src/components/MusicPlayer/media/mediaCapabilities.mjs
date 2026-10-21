export function supportedMediaProfile(mode = "video") {
  if (typeof document === "undefined") return null;
  const element = document.createElement(mode === "audio" ? "audio" : "video");
  const opus = Boolean(element.canPlayType(mode === "audio" ? 'audio/webm; codecs="opus"' : 'video/webm; codecs="vp9, opus"'));
  const aac = Boolean(element.canPlayType(mode === "audio" ? 'audio/mp4; codecs="mp4a.40.2"' : 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'));
  if (opus && aac) return "auto";
  if (opus) return "webm-opus";
  if (aac) return "mp4-aac";
  return null;
}
export function automaticMediaHeight(connection = globalThis.navigator?.connection) {
  if (connection?.saveData || ["slow-2g", "2g", "3g"].includes(connection?.effectiveType)) return 1080;
  const downlink = Number(connection?.downlink);
  return downlink >= 30 ? 2160 : downlink >= 15 ? 1440 : 1080;
}
