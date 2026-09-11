import { ApiRouteError } from "./apiResponseCore.mjs";

export const INSIGHT_RETENTION_MS = 30 * 86400_000;
export const MAX_INSIGHT_EVENTS = 1000;

export function retainedListeningEvents(events, now = Date.now()) {
  return (Array.isArray(events) ? events : []).filter((entry) => entry && Number.isFinite(entry.endedAt)
    && entry.endedAt <= now && entry.endedAt > now - INSIGHT_RETENTION_MS).slice(-MAX_INSIGHT_EVENTS);
}

export function insightEvent(body, now = Date.now()) {
  if (typeof body.eventId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.eventId)
    || !/^[A-Za-z0-9_-]{11}$/.test(body.id || "") || !["completed", "skipped", "stopped"].includes(body.event)
    || !Number.isFinite(body.listenedSeconds) || body.listenedSeconds < 0 || body.listenedSeconds > 86400
    || !Number.isFinite(body.startedAt) || body.startedAt > now || body.startedAt < now - 86400_000) {
    throw new ApiRouteError("VALIDATION_ERROR", { message: "Invalid listening observation." });
  }
  return { eventId: body.eventId, id: body.id, event: body.event, startedAt: body.startedAt,
    endedAt: now, listenedSeconds: Math.floor(Math.min(body.listenedSeconds, (now - body.startedAt) / 1000)) };
}

export function listeningSummary(events, days = 7, now = Date.now()) {
  const retained = retainedListeningEvents(events, now);
  const visible = retained.filter((entry) => entry.endedAt > now - days * 86400_000);
  const tracks = new Map();
  for (const entry of visible) {
    const track = tracks.get(entry.id) || { id: entry.id, sessions: 0, seconds: 0 };
    track.sessions += 1;
    track.seconds += Math.max(0, Number(entry.listenedSeconds) || 0);
    tracks.set(entry.id, track);
  }
  return { days, sessions: visible.length, completed: visible.filter((entry) => entry.event === "completed").length,
    seconds: [...tracks.values()].reduce((sum, track) => sum + track.seconds, 0),
    firstObservation: retained[0]?.startedAt || null, retainedEvents: retained.length,
    topTracks: [...tracks.values()].sort((first, second) => second.seconds - first.seconds || second.sessions - first.sessions).slice(0, 10) };
}

export function createListeningObservation({ id, eventId, now = Date.now, monotonic = () => performance.now() }) {
  let startedAt = null;
  let previous = null;
  let listenedSeconds = 0;
  let finished = false;
  return {
    sample(position, playing) {
      if (finished) return;
      const time = monotonic();
      if (playing && Number.isFinite(position) && position >= 0) {
        if (startedAt === null) startedAt = now();
        if (previous?.playing) {
          const elapsed = (time - previous.time) / 1000;
          const progress = position - previous.position;
          if (elapsed > 0 && elapsed <= 10 && progress > 0 && progress <= elapsed * 1.5 + 0.25) {
            listenedSeconds += Math.min(progress, elapsed);
          }
        }
      }
      previous = { position, playing, time };
    },
    finish(event) {
      if (finished || startedAt === null) return null;
      finished = true;
      return { id, eventId, event, startedAt, listenedSeconds: Math.floor(listenedSeconds) };
    },
  };
}