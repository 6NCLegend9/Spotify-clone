const STORED_UPDATE_CHANNELS = new Set(["stable", "beta", "internal"]);
const RENDERER_PACKAGED_CHANNELS = new Set(["stable", "beta"]);

export function normalizeStoredUpdateChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  return STORED_UPDATE_CHANNELS.has(channel) ? channel : "stable";
}

export function rendererSelectableUpdateChannel(
  value,
  { isPackaged = true, buildChannel = "stable" } = {},
) {
  const channel = String(value || "").trim().toLowerCase();
  if (RENDERER_PACKAGED_CHANNELS.has(channel)) return channel;
  if (channel === "internal" && (!isPackaged || normalizeStoredUpdateChannel(buildChannel) === "internal")) {
    return "internal";
  }
  return "";
}


export function effectiveUpdateChannel(
  value,
  { isPackaged = true, buildChannel = "stable" } = {},
) {
  const stored = normalizeStoredUpdateChannel(value);
  if (!isPackaged || stored !== "internal") return stored;
  const packagedChannel = normalizeStoredUpdateChannel(buildChannel);
  return packagedChannel === "internal" ? "internal" : packagedChannel;
}
