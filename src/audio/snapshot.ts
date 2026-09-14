import type { AudioSession, AudioTrack, QueueEntry, SnapshotStorage } from "./types";
import { createAudioSession, MAX_CONTEXT_TRACKS, MAX_HISTORY, MAX_USER_QUEUE, normalizeAudioTrack,
  normalizePlaybackContext, reduceAudioSession } from "./session";

export const AUDIO_SNAPSHOT_PREFIX = "heykasa:playback:v2:";
export const AUDIO_SNAPSHOT_MAX_AGE = 30 * 86400000;
export const AUDIO_SNAPSHOT_MAX_BYTES = 2_000_000;
const LEGACY_PREFIX = "heykasa:playback:v1:";
const MAX_COUNTER = 1_000_000_000_000;

export interface SnapshotPolicy { privateSession?: boolean; inJam?: boolean; }
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function counter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < MAX_COUNTER;
}
function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
function validOwner(owner: unknown): owner is string {
  return typeof owner === "string" && owner.trim().length > 0 && owner.length <= 500;
}
function permitted(policy: SnapshotPolicy): boolean { return !policy.privateSession && !policy.inJam; }

function normalizeEntry(value: unknown): QueueEntry | null {
  if (!record(value) || typeof value.entryId !== "string" || !/^q[1-9][0-9]{0,11}$/.test(value.entryId)
    || (value.origin !== "user" && value.origin !== "context") || !counter(value.contextRevision)) return null;
  const track = normalizeAudioTrack(value.track);
  const source = value.source === null ? null : normalizePlaybackContext(value.source);
  const index = value.contextIndex;
  if (!track || (value.source !== null && !source)
    || (index !== null && (!counter(index) || index >= MAX_CONTEXT_TRACKS))
    || (value.origin === "context" && (index === null || !source))) return null;
  return { entryId: value.entryId, track, source, origin: value.origin,
    contextRevision: value.contextRevision, contextIndex: index as number | null };
}

/** Validate structure before hydration. Never spread arbitrary localStorage properties into Redux. */
export function normalizeAudioSnapshot(value: unknown, owner: string): AudioSession | null {
  if (!validOwner(owner) || !record(value) || value.owner !== owner) return null;
  if (!counter(value.sequence) || !counter(value.contextRevision) || !counter(value.playbackRevision)
    || !counter(value.seekRevision) || !counter(value.shuffleSeed) || value.shuffleSeed > 0xffffffff
    || !finite(value.volume, 0, 1) || typeof value.isMuted !== "boolean" || typeof value.isShuffle !== "boolean"
    || !["off", "context", "track"].includes(value.repeatMode as string)
    || !finite(value.position, 0, Number.MAX_SAFE_INTEGER) || !finite(value.duration, 0, Number.MAX_SAFE_INTEGER)) return null;
  let context: AudioSession["context"] = null;
  if (value.context !== null) {
    if (!record(value.context) || !counter(value.context.revision) || value.context.revision > value.contextRevision
      || !Array.isArray(value.context.tracks) || !value.context.tracks.length || value.context.tracks.length > MAX_CONTEXT_TRACKS) return null;
    const source = normalizePlaybackContext(value.context.source);
    const tracks = value.context.tracks.map(normalizeAudioTrack);
    if (!source || tracks.some((track) => !track)) return null;
    context = { source, tracks: tracks as AudioTrack[], revision: value.context.revision };
  }
  const current = value.current === null ? null : normalizeEntry(value.current);
  if (value.current !== null && !current) return null;
  const groups: QueueEntry[][] = [];
  const limits = [MAX_USER_QUEUE + MAX_HISTORY, MAX_CONTEXT_TRACKS + MAX_HISTORY, MAX_HISTORY];
  const sources = [value.userQueue, value.contextQueue, value.history];
  for (let group = 0; group < sources.length; group += 1) {
    const items = sources[group];
    if (!Array.isArray(items) || items.length > limits[group]) return null;
    const parsed = items.map(normalizeEntry);
    if (parsed.some((entry) => !entry || (group === 0 && entry.origin !== "user") || (group === 1 && entry.origin !== "context"))) return null;
    groups.push(parsed as QueueEntry[]);
  }
  const all = [...(current ? [current] : []), ...groups.flat()];
  if (!context && all.some((entry) => entry.origin === "context")) return null;
  const ids = new Set<string>();
  let sequence = value.sequence;
  for (const entry of all) {
    if (ids.has(entry.entryId) || entry.contextRevision > value.contextRevision) return null;
    ids.add(entry.entryId);
    sequence = Math.max(sequence, Number(entry.entryId.slice(1)));
    if (entry.origin === "context" && context && entry.contextRevision === context.revision) {
      const original = context.tracks[entry.contextIndex!];
      if (!original || original.id !== entry.track.id || original.provider !== entry.track.provider
        || entry.source?.id !== context.source.id) return null;
    }
  }
  // The first authenticated user gesture resumes sound; restoration never forces autoplay.
  return { ...createAudioSession(owner), context, current,
    userQueue: groups[0], contextQueue: groups[1], history: groups[2], sequence,
    contextRevision: value.contextRevision, shuffleSeed: value.shuffleSeed,
    playbackRevision: value.playbackRevision, seekRevision: value.seekRevision,
    position: current ? Math.min(value.duration > 0 ? value.duration : Number.MAX_SAFE_INTEGER, value.position) : 0,
    duration: current ? value.duration : 0, volume: value.volume, isMuted: value.isMuted,
    isShuffle: value.isShuffle, repeatMode: value.repeatMode as AudioSession["repeatMode"],
    isPlaying: false, status: current ? "paused" : "idle" };
}

function parseEnvelope(raw: string | null, owner: string, now: number, version: number): Record<string, unknown> | null {
  if (!raw || raw.length > AUDIO_SNAPSHOT_MAX_BYTES || new TextEncoder().encode(raw).byteLength > AUDIO_SNAPSHOT_MAX_BYTES) return null;
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== version || value.owner !== owner
    || !finite(value.savedAt, 0, now) || now - value.savedAt > AUDIO_SNAPSHOT_MAX_AGE) return null;
  return value;
}

function migrateLegacy(value: Record<string, unknown>, owner: string): AudioSession | null {
  const convert = (input: unknown): AudioTrack | null => {
    if (!record(input)) return null;
    return normalizeAudioTrack({ ...input, provider: "youtube", artist: input.channel });
  };
  const selected = convert(value.youtubeVideo);
  if (!selected) return null;
  const tracks = (Array.isArray(value.youtubeQueue) ? value.youtubeQueue : []).slice(0, MAX_CONTEXT_TRACKS)
    .map(convert).filter((track): track is AudioTrack => track !== null);
  let index = tracks.findIndex((track) => track.id === selected.id);
  if (index < 0) { tracks.unshift(selected); index = 0; }
  if (tracks.length > MAX_CONTEXT_TRACKS) return null;
  const session = reduceAudioSession(createAudioSession(owner), {
    type: "startContext", tracks, index,
    context: { id: "restored-v1", type: "unknown", name: "Previous session" },
  });
  return { ...session, position: finite(value.position, 0, 86400) ? Math.min(session.duration > 0 ? session.duration : 86400, value.position) : 0,
    isPlaying: false, status: "paused" };
}

export function readAudioSnapshot(storage: SnapshotStorage | null | undefined, owner: string | null,
  now = Date.now(), policy: SnapshotPolicy = {}): AudioSession | null {
  if (!storage || !validOwner(owner) || !finite(now, 0, Number.MAX_SAFE_INTEGER) || !permitted(policy)) return null;
  try {
    const raw = storage.getItem(`${AUDIO_SNAPSHOT_PREFIX}${encodeURIComponent(owner)}`);
    // A present but corrupt v2 snapshot does not revive unrelated legacy state.
    if (raw !== null) {
      const envelope = parseEnvelope(raw, owner, now, 2);
      return envelope ? normalizeAudioSnapshot(envelope.session, owner) : null;
    }
    const legacy = parseEnvelope(storage.getItem(`${LEGACY_PREFIX}${encodeURIComponent(owner)}`), owner, now, 1);
    return legacy ? migrateLegacy(legacy, owner) : null;
  } catch { return null; }
}

export function writeAudioSnapshot(storage: SnapshotStorage | null | undefined, owner: string | null,
  state: AudioSession, now = Date.now(), policy: SnapshotPolicy = {}): boolean {
  if (!storage || !validOwner(owner) || !finite(now, 0, Number.MAX_SAFE_INTEGER) || !permitted(policy)) return false;
  try {
    const session = normalizeAudioSnapshot(state, owner);
    if (!session) return false;
    const raw = JSON.stringify({ version: 2, owner, savedAt: now, session });
    if (new TextEncoder().encode(raw).byteLength > AUDIO_SNAPSHOT_MAX_BYTES) return false;
    storage.setItem(`${AUDIO_SNAPSHOT_PREFIX}${encodeURIComponent(owner)}`, raw);
    return true;
  } catch { return false; }
}
