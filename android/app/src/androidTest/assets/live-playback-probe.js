(() => {
  if (window.qaLivePlayback) return;
  const bounded = (value, maximum = 1_000_000) => Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : null;
  const keep = (list, value, limit = 32) => { list.push(value); if (list.length > limit) list.shift(); };
  const youtubeOrigin = origin => {
    try { return ["www.youtube.com", "www.youtube-nocookie.com", "youtube.com", "youtube-nocookie.com"].includes(new URL(origin).hostname); }
    catch { return false; }
  };
  const blankYoutube = () => ({ ready: false, state: null, position: null, duration: null, volume: null, muted: null });
  let players = new WeakMap();
  let attempt = 0;
  const appFrames = () => [...document.querySelectorAll("[data-testid='youtube-decks'] iframe")].filter(node => {
    try { return youtubeOrigin(new URL(node.src).origin); } catch { return false; }
  });
  const activeFrame = () => appFrames().find(node => node.closest("[data-active-deck]")?.getAttribute("data-active-deck") === "true");
  const error = (record, value) => {
    const code = Number(value);
    if (Number.isInteger(code) && code >= 0 && code <= 999 && !record.providerErrors.includes(code)) keep(record.providerErrors, code, 16);
  };
  const network = [];
  let pageErrors = 0, mediaService = null;
  window.addEventListener("message", event => {
    if (!youtubeOrigin(event.origin)) return;
    // Keep each legitimate deck's messages separate. An inactive preload or
    // outgoing crossfade must never prove playback of the selected song.
    if (!appFrames().some(frame => frame.contentWindow === event.source)) return;
    let record = players.get(event.source);
    if (!record) {
      record = { youtube: blankYoutube(), states: [], providerErrors: [] };
      players.set(event.source, record);
    }
    const { youtube, states } = record;
    let data;
    try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
    if (!data || typeof data !== "object") return;
    if (data.event === "onReady") youtube.ready = true;
    if (data.event === "onError") error(record, data.info);
    if (!["infoDelivery", "initialDelivery"].includes(data.event) || !data.info || typeof data.info !== "object") return;
    const info = data.info;
    if (Number.isInteger(info.playerState) && info.playerState >= -1 && info.playerState <= 5) {
      youtube.ready = true;
      if (youtube.state !== info.playerState) keep(states, info.playerState);
      youtube.state = info.playerState;
    }
    for (const [source, target] of [["currentTime", "position"], ["duration", "duration"], ["volume", "volume"]]) {
      if (Number.isFinite(info[source])) youtube[target] = bounded(info[source], source === "volume" ? 100 : 100_000);
    }
    if (typeof info.muted === "boolean") youtube.muted = info.muted;
  });
  window.addEventListener("error", () => { pageErrors = Math.min(100, pageErrors + 1); });
  window.addEventListener("unhandledrejection", () => { pageErrors = Math.min(100, pageErrors + 1); });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    let route = "other";
    try {
      const path = new URL(typeof args[0] === "string" ? args[0] : args[0]?.url, location.href).pathname;
      if (["/api/media/resolve", "/api/youtube-search", "/api/youtube-videos"].includes(path)) route = path;
    } catch { /* Request values never enter diagnostic output. */ }
    try {
      const response = await originalFetch(...args);
      if (route !== "other") keep(network, { route, status: response.status });
      if (route === "/api/media/resolve" && (!args[1]?.method || args[1].method === "GET")) {
        void response.clone().json().then(result => {
          const reasons = ["service_disabled", "authentication_required", "service_unconfigured", "service_unavailable", "sign_in_required", "mobile_only", "setup_incomplete", "source_access_restricted", "unconfigured", "forbidden", "rate_limited"];
          mediaService = { enabled: result.enabled === true, reason: reasons.includes(result.reason) ? result.reason : "other" };
        }).catch(() => {});
      }
      return response;
    } catch (failure) {
      if (route !== "other") keep(network, { route, status: 0 });
      throw failure;
    }
  };
  function visible(node) {
    if (!node) return false;
    let box = node.getBoundingClientRect();
    let top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
    let left = Math.max(0, box.left), right = Math.min(innerWidth, box.right);
    for (let parent = node; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      box = parent.getBoundingClientRect();
      if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
      if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
    }
    return bottom - top > 2 && right - left > 2;
  }
  const visibleButton = label => [...document.querySelectorAll("button[aria-label]")].some(node => node.getAttribute("aria-label") === label && visible(node));
  window.qaLivePlayback = {
    // Start a separate observation for an explicit user action without changing
    // the provider. A reused iframe must not retain the previous attempt's data.
    resetAttempt() { players = new WeakMap(); attempt += 1; },
    snapshot() {
      const feedback = document.querySelector("[data-testid='playback-feedback'], .yt-dock-feedback");
      const frame = activeFrame();
      const record = frame ? players.get(frame.contentWindow) : null;
      return {
        schemaVersion: 1, attempt, documentStartedAt: bounded(performance.timeOrigin, 10_000_000_000_000), documentState: document.readyState,
        youtube: { ...(record?.youtube || blankYoutube()) }, states: [...(record?.states || [])], providerErrors: [...(record?.providerErrors || [])], network: [...network], pageErrors, mediaService,
        activeIframeMatched: !!record,
        iframeCount: [...document.querySelectorAll("iframe")].filter(node => { try { return youtubeOrigin(new URL(node.src).origin); } catch { return false; } }).length,
        media: [...document.querySelectorAll("[data-testid='youtube-decks'] [data-active-deck='true'] audio,[data-testid='youtube-decks'] [data-active-deck='true'] video")].slice(0, 4).map(node => ({ native: node.isAndroidNativeMedia === true, position: bounded(node.currentTime), duration: bounded(node.duration), paused: node.paused, muted: node.muted, volume: bounded(node.volume, 1), readyState: node.readyState, mediaError: node.error?.code || 0 })),
        ui: { pauseVisible: visibleButton("Pause"), playVisible: visibleButton("Play"), feedbackPresent: !!feedback, feedbackVisible: visible(feedback), position: bounded(Number(document.querySelector("input[aria-label='Song progress']")?.value)) },
      };
    },
  };
  // Availability only; this GET cannot start source extraction.
  void window.fetch("/api/media/resolve", { credentials: "same-origin", cache: "no-store" }).catch(() => {});
})();
