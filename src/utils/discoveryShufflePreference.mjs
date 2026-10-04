export const DISCOVERY_SHUFFLE_STORAGE_KEY = "heykasa.discoveryShuffle";

export function readDiscoveryShufflePreference(storage) {
  try {
    const canonical = storage?.getItem?.(DISCOVERY_SHUFFLE_STORAGE_KEY);
    if (canonical === "true" || canonical === "false") return canonical === "true";
    return storage?.getItem?.("autoAdd") === "true";
  } catch {
    return false;
  }
}

export function writeDiscoveryShufflePreference(storage, enabled) {
  try {
    storage?.setItem?.(DISCOVERY_SHUFFLE_STORAGE_KEY, enabled ? "true" : "false");
    storage?.removeItem?.("autoAdd");
    return true;
  } catch {
    return false;
  }
}
