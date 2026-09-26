const EXTERNAL_NETWORK_ERRORS = [
  "ERR_NAME_NOT_RESOLVED",
  "ERR_CONNECTION_REFUSED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_CLOSED",
  "ERR_CONNECTION_TIMED_OUT",
  "ERR_TIMED_OUT",
  "ERR_NETWORK_CHANGED",
  "ERR_INTERNET_DISCONNECTED",
];

function isYoutubeProviderUrl(value) {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase();
    return host === "youtube.com"
      || host.endsWith(".youtube.com")
      || host === "youtube-nocookie.com"
      || host.endsWith(".youtube-nocookie.com")
      || host === "googlevideo.com"
      || host.endsWith(".googlevideo.com")
      || host === "ytimg.com"
      || host.endsWith(".ytimg.com");
  } catch {
    return /(?:youtube|googlevideo|ytimg)/i.test(String(value || ""));
  }
}

export function classifyYoutubeProviderFailure({
  message = "",
  requestFailures = [],
  responseStatuses = [],
  playerErrorCodes = [],
  providerApiLoaded = false,
} = {}) {
  const externalRequestFailure = (Array.isArray(requestFailures) ? requestFailures : []).some((entry) => {
    const text = String(entry || "");
    return isYoutubeProviderUrl(text)
      && EXTERNAL_NETWORK_ERRORS.some((code) => text.includes(code));
  });
  if (externalRequestFailure) return "external-provider";

  const externalStatus = (Array.isArray(responseStatuses) ? responseStatuses : []).some((entry) => {
    const status = Number(entry?.status);
    return isYoutubeProviderUrl(entry?.url)
      && (status === 429 || status === 451 || status >= 500);
  });
  if (externalStatus) return "external-provider";

  const externalPlayerError = (Array.isArray(playerErrorCodes) ? playerErrorCodes : [])
    .map(Number)
    .some((code) => code === 100 || code === 101 || code === 150);
  if (externalPlayerError) return "external-provider";

  if (providerApiLoaded) return "integration";

  const text = String(message || "").toLowerCase();
  if (
    text.includes("player dock")
    || text.includes("iframe never mounted")
    || text.includes("youtube iframe")
    || text.includes("aria-hidden")
    || text.includes("bounding")
    || text.includes("expanded video")
  ) {
    return "integration";
  }

  return "unknown";
}
