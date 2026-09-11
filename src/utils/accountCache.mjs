export function accountOwner(session, status) {
  if (status === "unauthenticated") return "guest";
  const id = session?.user?.id;
  return status === "authenticated" && typeof id === "string" && id.trim()
    ? `account:${id}` : null;
}

export function readAccountCache(storage, namespace, owner, maxAge = 300_000, now = Date.now()) {
  if (!owner) return null;
  try {
    const raw = storage.getItem(`${namespace}:${encodeURIComponent(owner)}`);
    if (!raw || raw.length > 300_000) return null;
    const cached = JSON.parse(raw);
    if (cached?.version !== 1 || cached.owner !== owner || !Number.isFinite(cached.savedAt)
      || cached.savedAt > now || now - cached.savedAt >= maxAge) return null;
    return cached.data ?? null;
  } catch {
    return null;
  }
}

export function writeAccountCache(storage, namespace, owner, data, now = Date.now()) {
  if (!owner) return false;
  try {
    const raw = JSON.stringify({ version: 1, owner, savedAt: now, data });
    if (raw.length > 300_000) return false;
    storage.setItem(`${namespace}:${encodeURIComponent(owner)}`, raw);
    return true;
  } catch {
    return false;
  }
}