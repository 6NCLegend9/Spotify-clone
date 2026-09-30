function safe(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function createPlaybackClockStore(initial = {}) {
  let snapshot = {
    position: safe(initial.position),
    duration: safe(initial.duration),
  };
  const listeners = new Set();

  return {
    read: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(next = {}) {
      const candidate = {
        position: safe(next.position),
        duration: safe(next.duration),
      };
      if (
        candidate.position === snapshot.position
        && candidate.duration === snapshot.duration
      ) return;
      snapshot = candidate;
      listeners.forEach((listener) => listener());
    },
  };
}

export function publishPlaybackTick({
  clock,
  position,
  duration,
  now,
  lastUiCommitAt = 0,
  uiIntervalMs = 450,
  commitPosition,
} = {}) {
  const snapshot = {
    position: safe(position),
    duration: safe(duration),
  };
  clock?.publish?.(snapshot);
  const timestamp = Number.isFinite(Number(now)) ? Number(now) : 0;
  if (timestamp - lastUiCommitAt < uiIntervalMs) return lastUiCommitAt;
  commitPosition?.(snapshot.position);
  return timestamp;
}
