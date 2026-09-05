export const JAM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JAM_CODE_LENGTH = 6;
export const EMPTY_JAM_MS = 10 * 60 * 1000;
export const JAM_HEARTBEAT_MS = 4 * 1000;
export const HOST_RECONNECT_GRACE_MS = 30 * 1000;
export const JAM_SESSION_KEY = "heykasa.jam";
export const JAM_OPEN_KEY = "heykasa.jam.open";
export const JAM_OPEN_EVENT = "heykasa:open-jam";
export const JAM_PLAYBACK_STATE_EVENT = "heykasa:playback-state";
export const JAM_REMOTE_PLAYBACK_EVENT = "heykasa:jam-playback";
export const JAM_REMOTE_SEEK_EVENT = "heykasa:jam-seek";

export function normalizeJamCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, JAM_CODE_LENGTH);
}

export function isJamCode(value) {
  const code = normalizeJamCode(value);
  return code.length === JAM_CODE_LENGTH
    && [...code].every((character) => JAM_CODE_ALPHABET.includes(character));
}

export function makeJamCode(random = Math.random) {
  let code = "";
  for (let index = 0; index < JAM_CODE_LENGTH; index += 1) {
    code += JAM_CODE_ALPHABET[Math.floor(random() * JAM_CODE_ALPHABET.length)];
  }
  return code;
}

export function jamPath(code) {
  return `/jam/${normalizeJamCode(code)}`;
}

export function jamCodeFromPath(pathname) {
  const match = String(pathname || "").match(/^\/jam\/([^/?#]+)\/?$/i);
  const code = normalizeJamCode(match?.[1]);
  return isJamCode(code) ? code : "";
}

export function jamChannelName(code) {
  return `jam-${normalizeJamCode(code)}`;
}

export function shouldExpireEmptyJam(session, now = Date.now()) {
  if (session?.role !== "host" || session?.guestJoined) return false;
  const startedAt = Number(session?.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return true;
  return now - startedAt >= EMPTY_JAM_MS;
}

export function projectJamPlaybackTime(
  currentTime,
  isPlaying,
  sentAt,
  now = Date.now(),
) {
  const base = Math.max(0, Number(currentTime) || 0);
  const transitMs = Number(now) - Number(sentAt);
  const transitSeconds = isPlaying
    && Number.isFinite(transitMs)
    && transitMs >= 0
    && transitMs <= 5000
    ? transitMs / 1000
    : 0;
  return base + transitSeconds;
}

export function readJamSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(JAM_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isJamCode(parsed?.code) || (parsed.role !== "host" && parsed.role !== "guest")) {
      return null;
    }
    const startedAt = Number(parsed.startedAt);
    return {
      code: normalizeJamCode(parsed.code),
      role: parsed.role,
      startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 0,
      guestJoined: Boolean(parsed.guestJoined),
      participantId: String(parsed.participantId || ""),
    };
  } catch {
    return null;
  }
}

export function writeJamSession(session) {
  if (typeof window === "undefined") return;
  try {
    if (!isJamCode(session?.code) || (session?.role !== "host" && session?.role !== "guest")) {
      window.sessionStorage.removeItem(JAM_SESSION_KEY);
      return;
    }
    window.sessionStorage.setItem(
      JAM_SESSION_KEY,
      JSON.stringify({
        code: normalizeJamCode(session.code),
        role: session.role,
        startedAt: Number(session.startedAt) > 0 ? Number(session.startedAt) : Date.now(),
        guestJoined: Boolean(session.guestJoined),
        participantId: String(session.participantId || ""),
      }),
    );
  } catch {
    // Storage may be unavailable in hardened/private browsing contexts.
  }
}

export function clearJamSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(JAM_SESSION_KEY);
  } catch {
    // Storage may be unavailable in hardened/private browsing contexts.
  }
}

export function requestJamOpen() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(JAM_OPEN_KEY, "1");
  } catch {
    // The in-memory event below still opens the mounted controller.
  }
  window.dispatchEvent(new Event(JAM_OPEN_EVENT));
}

export function consumeJamOpenRequest() {
  if (typeof window === "undefined") return false;
  try {
    const requested = window.sessionStorage.getItem(JAM_OPEN_KEY) === "1";
    if (requested) window.sessionStorage.removeItem(JAM_OPEN_KEY);
    return requested;
  } catch {
    return false;
  }
}
