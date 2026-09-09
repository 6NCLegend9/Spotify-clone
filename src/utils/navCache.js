const store = new Map();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function readNavCache(key, maxAge = DEFAULT_TTL_MS) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.t > maxAge) {
    store.delete(key);
    return undefined;
  }
  return entry.v;
}

export function writeNavCache(key, value) {
  store.set(key, { t: Date.now(), v: value });
  return value;
}

export function clearNavCache(prefix) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key === prefix || key.startsWith(prefix)) store.delete(key);
  }
}
