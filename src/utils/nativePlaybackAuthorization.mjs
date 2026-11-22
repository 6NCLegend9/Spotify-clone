import { accountStorageGeneration } from "./accountStorage.mjs";

const endpoint = "/api/media/resolve";
const bearer = value => typeof value === "string" && /^npr1_[A-Za-z0-9_-]{43}$/.test(value);

export async function revokeNativePlaybackGrant(nativeGrant) {
  if (!bearer(nativeGrant)) return false;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, { method: "POST", credentials: "omit", cache: "no-store", redirect: "error", keepalive: true, signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${nativeGrant}` },
      body: JSON.stringify({ action: "revokeNativeGrant" }) });
    return response.ok;
  } catch { return false; }
  finally { clearTimeout(deadline); }
}

export async function requestNativePlaybackGrant({ receipt, videoIds, profile, signal, transportVersion, nativeQueue }) {
  // This permission is only handed to an actual binary consumer, never a
  // legacy bridge or an iframe/browser playback fallback.
  if (transportVersion !== 2 || nativeQueue !== "source-queue-v1") throw new Error("native_queue_unsupported");
  const generation = accountStorageGeneration();
  const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "nativeGrant", receipt, videoIds, profile }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.reason || "native_authorization_unavailable");
  if (generation !== accountStorageGeneration() || signal?.aborted) {
    await revokeNativePlaybackGrant(result.nativeGrant);
    throw new DOMException("Playback account changed", "AbortError");
  }
  if (!bearer(result.nativeGrant) || typeof result.grantId !== "string" || !Number.isFinite(result.expiresAt)
    || result.expiresAt <= Date.now() || result.expiresAt > Date.now() + 3605_000) {
    await revokeNativePlaybackGrant(result.nativeGrant);
    throw new Error("native_authorization_invalid");
  }
  return result;
}

export async function revokeDeviceNativePlaybackGrants() {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", keepalive: true, signal: controller.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revokeNativeGrants" }) });
    return response.ok;
  } catch { return false; }
  finally { clearTimeout(deadline); }
}
