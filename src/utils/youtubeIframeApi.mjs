const API_URL = "https://www.youtube.com/iframe_api";

// A blocked SDK request must not leave the selected song pretending to play.
export function watchYoutubeIframeApi({ onReady, onError, retry = false, timeoutMs = 15_000 }) {
  if (window.YT?.Player) { onReady(); return () => {}; }
  let script = document.querySelector(`script[src="${API_URL}"]`);
  if (retry && script) { script.remove(); script = null; }
  const created = !script;
  if (created) { script = document.createElement("script"); script.src = API_URL; }
  const previousReady = window.onYouTubeIframeAPIReady;
  let settled = false;
  const fail = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    onError();
  };
  const ready = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try { previousReady?.(); } catch { /* Another subscriber cannot block this player. */ }
    onReady();
  };
  window.onYouTubeIframeAPIReady = ready;
  script.addEventListener("error", fail);
  const timer = setTimeout(fail, timeoutMs);
  if (created) document.head.appendChild(script);
  return () => {
    settled = true;
    clearTimeout(timer);
    script.removeEventListener("error", fail);
    if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previousReady;
  };
}
