export const ACCOUNT_DATA_CLEARED = "heykasa:account-data-cleared";
export const ACCOUNT_LOGOUT_KEY = "heykasa:account-logout";
let activeOwner;
let generation = 0;

export function getActiveAccountOwner() { return activeOwner; }
export function setActiveAccountOwner(owner) { activeOwner = owner; }
export function accountStorageGeneration() { return generation; }
export function canWriteAccountCache(owner) {
  return typeof owner === "string" && (!owner.startsWith("account:") || activeOwner === undefined || activeOwner === owner);
}

export function clearAccountStorage(storage) {
  if (!storage) return;
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && (/^(?:heykasa:history:v1:|heykasa:playback:v1:|HayKasa-home-recommendations-v3:)(?:account:|account%3A)/.test(key)
      || /^heykasa\.library\.view:account:/.test(key)
      || ["HayKasa-track-cache-v1", "heykasa.jam", "songHistory", "HayKasa-home-recommendations-v2:authenticated"].includes(key))) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

export function clearLocalAccountCaches({ notify = true, broadcast = false } = {}) {
  activeOwner = null;
  generation += 1;
  if (typeof window === "undefined") return;
  for (const name of ["localStorage", "sessionStorage"]) {
    try { clearAccountStorage(window[name]); } catch { /* Storage may be disabled. */ }
  }
  if (notify) window.dispatchEvent(new Event(ACCOUNT_DATA_CLEARED));
  if (broadcast) {
    try { window.localStorage.setItem(ACCOUNT_LOGOUT_KEY, `${Date.now()}:${Math.random()}`); } catch { /* Optional cross-tab cleanup. */ }
  }
}
