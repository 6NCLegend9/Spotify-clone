let status = { state: "idle", detail: "" };
const listeners = new Set();

export function getDiscordPresenceStatus() {
  return status;
}

export function subscribeDiscordPresenceStatus(listener) {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export function setDiscordPresenceStatus(next) {
  status = {
    state: next.state || "idle",
    detail: typeof next.detail === "string" ? next.detail : "",
  };
  listeners.forEach((listener) => listener(status));
}
