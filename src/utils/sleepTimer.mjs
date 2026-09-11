const KEY = "heykasa:sleep-timer:v1";

export function createSleepTimer({ owner, storage, onChange, onExpire, now = Date.now,
  monotonic = () => performance.now(), schedule = setTimeout, unschedule = clearTimeout }) {
  let timer = null;
  let timeout;
  let monotonicDeadline = Infinity;
  let disposed = false;
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || "null");
    if (saved?.version === 1 && saved.owner === owner && Number.isFinite(saved.createdAt)
      && saved.createdAt <= now() && now() - saved.createdAt < 86400_000
      && (saved.mode === "track" && typeof saved.trackId === "string"
        || saved.mode === "minutes" && [15, 30, 60].includes(saved.minutes)
          && Number.isFinite(saved.deadline) && saved.deadline === saved.createdAt + saved.minutes * 60_000)) {
      timer = saved;
    }
  } catch {}

  const publish = () => {
    unschedule(timeout);
    monotonicDeadline = timer?.mode === "minutes" ? monotonic() + Math.max(0, timer.deadline - now()) : Infinity;
    try {
      if (timer) storage?.setItem(KEY, JSON.stringify(timer));
      else storage?.removeItem(KEY);
    } catch {}
    onChange(timer);
    if (timer?.mode === "minutes") timeout = schedule(() => check(), Math.max(0, timer.deadline - now()));
  };

  const check = (endedTrackId) => {
    if (disposed || !timer) return false;
    const due = timer.mode === "track" ? endedTrackId === timer.trackId
      : now() >= timer.deadline || monotonic() >= monotonicDeadline;
    if (!due) return false;
    timer = null;
    publish();
    onExpire();
    return true;
  };

  const cancel = () => {
    if (disposed) return;
    timer = null;
    publish();
  };

  publish();
  check();
  return {
    check,
    cancel,
    start(value, trackId) {
      if (disposed || !owner) return;
      if (value === "off") { cancel(); return; }
      if (value !== "track" && ![15, 30, 60].includes(Number(value))) return;
      if (value === "track" && !trackId) return;
      const createdAt = now();
      timer = { version: 1, owner, createdAt, mode: value === "track" ? "track" : "minutes",
        ...(value === "track" ? { trackId } : { minutes: Number(value), deadline: createdAt + Number(value) * 60_000 }) };
      publish();
    },
    trackChanged(trackId) {
      if (timer?.mode === "track" && timer.trackId !== trackId) cancel();
    },
    dispose() { disposed = true; unschedule(timeout); },
  };
}