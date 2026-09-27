const STORED_UPDATE_CHANNELS = new Set(["stable", "beta", "internal"]);
const RENDERER_PACKAGED_CHANNELS = new Set(["stable", "beta"]);

export function normalizeStoredUpdateChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  return STORED_UPDATE_CHANNELS.has(channel) ? channel : "stable";
}

export function rendererSelectableUpdateChannel(value, { isPackaged = true } = {}) {
  const channel = String(value || "").trim().toLowerCase();
  if (RENDERER_PACKAGED_CHANNELS.has(channel)) return channel;
  if (!isPackaged && channel === "internal") return "internal";
  return "";
}
