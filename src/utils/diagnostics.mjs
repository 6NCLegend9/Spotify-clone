const records = [];
const EVENTS = new Set(["request", "api_error", "render_error", "chunk_error", "provider", "session_lookup", "playback_state", "playback_error"]);
const CODES = new Set(["OK", "NETWORK_ERROR", "TIMEOUT", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "VALIDATION_ERROR", "INTERNAL_ERROR", "PLAYBACK_ERROR", "playing", "paused", "buffering", "ended"]);
const ROUTES = new Set(["settings", "language", "favourite", "history", "recommendations", "userInfo", "userPlaylists", "playEvent", "youtube-search", "youtube-videos", "youtube-playlist", "youtube-channel", "lyrics", "notInterested", "snoozedTracks", "genres", "tags", "followedArtists"]);

export function diagnosticRoute(value) {
  try {
    const path = new URL(value, "https://local.invalid").pathname;
    if (path.startsWith("/api/auth/")) return "/api/auth/:action";
    if (path.startsWith("/api/account/")) return "/api/account/:action";
    const [, api, name, extra] = path.split("/");
    return api === "api" && ROUTES.has(name) ? `/api/${name}${extra ? "/:action" : ""}` : "other";
  } catch { return "other"; }
}

export function diagnosticRecord(event, details = {}, now = Date.now()) {
  const record = { event: EVENTS.has(event) ? event : "api_error", at: new Date(Math.floor(now / 1000) * 1000).toISOString() };
  if (details.route) record.route = diagnosticRoute(details.route);
  if (CODES.has(details.code)) record.code = details.code;
  if (Number.isFinite(details.durationMs)) record.durationMs = Math.min(600_000, Math.max(0, Math.round(details.durationMs)));
  if (Number.isInteger(details.status) && details.status >= 100 && details.status <= 599) record.status = details.status;
  if (typeof details.requestId === "string" && /^[a-f0-9-]{36}$/i.test(details.requestId)) record.requestId = details.requestId;
  return record;
}

export function recordDiagnostic(event, details) {
  const record = diagnosticRecord(event, details);
  if (typeof window !== "undefined") {
    records.push(record);
    if (records.length > 100) records.shift();
  }
  return record;
}

export function logServerDiagnostic(event, details) {
  if (process.env.SERVER_DIAGNOSTICS === "1") console.info(JSON.stringify(diagnosticRecord(event, details)));
}

export function diagnosticSnapshot() {
  return { formatVersion: 1, generatedAt: new Date().toISOString(), events: records.map((entry) => ({ ...entry })) };
}

export function clearDiagnostics() { records.length = 0; }