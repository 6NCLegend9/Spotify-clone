import type { AudioCommand, AudioSession, AudioTrack, PlaybackContext, PlaybackToken, QueueEntry } from "./types";

export const MAX_HISTORY = 50;
export const MAX_CONTEXT_TRACKS = 5000;
export const MAX_USER_QUEUE = 1000;
const CONTEXT_TYPES = new Set(["playlist", "album", "artist", "search", "home", "radio", "unknown"]);

export function createAudioSession(owner: string | null = null): AudioSession {
  return {
    owner, current: null, userQueue: [], contextQueue: [], context: null, history: [],
    position: 0, duration: 0, volume: 0.8, isMuted: false, isShuffle: false,
    repeatMode: "off", isPlaying: false, status: "idle", error: null,
    sequence: 0, contextRevision: 0, shuffleSeed: 1, playbackRevision: 0, seekRevision: 0,
  };
}

export function safeInternalHref(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 2048 && /^\/(?!\/)/.test(value)
    && !/[\\\u0000-\u0020]/.test(value) ? value : undefined;
}

export function normalizeAudioTrack(value: unknown): AudioTrack | null {
  if (!value || typeof value !== "object") return null;
  const track = value as Record<string, unknown>;
  if ((track.provider !== "youtube" && track.provider !== "native")
    || typeof track.id !== "string" || !track.id.trim() || track.id.length > 200
    || (track.provider === "youtube" && !/^[A-Za-z0-9_-]{11}$/.test(track.id))) return null;
  return {
    id: track.id, provider: track.provider,
    title: typeof track.title === "string" ? track.title.slice(0, 500) : "",
    artist: typeof track.artist === "string" ? track.artist.slice(0, 300) : "",
    ...(typeof track.thumbnail === "string" && /^https:\/\//.test(track.thumbnail) && track.thumbnail.length <= 2048
      ? { thumbnail: track.thumbnail } : {}),
    ...(typeof track.duration === "number" && Number.isFinite(track.duration) && track.duration >= 0 && track.duration <= Number.MAX_SAFE_INTEGER
      ? { duration: track.duration } : {}),
    ...(safeInternalHref(track.artistHref) ? { artistHref: safeInternalHref(track.artistHref) } : {}),
    ...(safeInternalHref(track.albumHref) ? { albumHref: safeInternalHref(track.albumHref) } : {}),
  };
}

export function normalizePlaybackContext(value: unknown): PlaybackContext | null {
  if (!value || typeof value !== "object") return null;
  const context = value as Record<string, unknown>;
  if (typeof context.id !== "string" || !context.id || context.id.length > 500
    || typeof context.name !== "string" || !context.name.trim()
    || typeof context.type !== "string" || !CONTEXT_TYPES.has(context.type)) return null;
  return {
    id: context.id, type: context.type as PlaybackContext["type"], name: context.name.slice(0, 500),
    ...(safeInternalHref(context.href) ? { href: safeInternalHref(context.href) } : {}),
  };
}

export function currentPlaybackToken(state: AudioSession): PlaybackToken | null {
  return state.current ? { entryId: state.current.entryId, playbackRevision: state.playbackRevision } : null;
}

export function matchesPlaybackToken(state: AudioSession, token: PlaybackToken | undefined): boolean {
  return Boolean(state.current && token && token.entryId === state.current.entryId
    && token.playbackRevision === state.playbackRevision);
}

export function playingFrom(state: AudioSession): string {
  if (!state.current) return "Nothing playing";
  if (state.current.origin === "user") return "Playing from your queue";
  return state.current.source ? `Playing from ${state.current.source.name}` : "Now playing";
}

function boundedPosition(value: number, duration: number): number {
  return Math.min(duration > 0 ? duration : Number.MAX_SAFE_INTEGER, Math.max(0, value));
}

function shuffled<T>(input: T[], seed: number): T[] {
  let random = seed >>> 0 || 1;
  const items = input.slice();
  for (let index = items.length - 1; index > 0; index -= 1) {
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
    const target = Math.floor(((random >>> 0) / 4294967296) * (index + 1));
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}

function addHistory(state: AudioSession): QueueEntry[] {
  return state.current ? [...state.history, state.current].slice(-MAX_HISTORY) : state.history;
}

function select(state: AudioSession, entry: QueueEntry, history = addHistory(state)): AudioSession {
  return { ...state, current: entry, history, position: 0, duration: entry.track.duration || 0,
    isPlaying: true, status: "loading", error: null, playbackRevision: state.playbackRevision + 1 };
}

function contextEntries(state: AudioSession, tracks: AudioTrack[], source: PlaybackContext, revision: number, offset = 0): QueueEntry[] {
  return tracks.map((track, index) => ({ entryId: `q${state.sequence + index + 1}`, track,
    origin: "context", source, contextRevision: revision, contextIndex: offset + index }));
}

function advance(state: AudioSession, reason: "skip" | "ended"): AudioSession {
  if (reason === "ended" && state.status === "ended") return state;
  if (reason === "ended" && state.current && state.repeatMode === "track") {
    return select(state, state.current, state.history);
  }
  if (state.userQueue.length) {
    return select({ ...state, userQueue: state.userQueue.slice(1) }, state.userQueue[0]);
  }
  if (state.contextQueue.length) {
    return select({ ...state, contextQueue: state.contextQueue.slice(1) }, state.contextQueue[0]);
  }
  if (state.repeatMode === "context" && state.context?.tracks.length) {
    const { tracks, source, revision } = state.context;
    const entries = contextEntries(state, tracks, source, revision);
    const seed = (state.shuffleSeed + 1) >>> 0;
    const ordered = state.isShuffle ? shuffled(entries, seed) : entries;
    return select({ ...state, sequence: state.sequence + entries.length,
      shuffleSeed: seed, contextQueue: ordered.slice(1) }, ordered[0]);
  }
  return { ...state, isPlaying: false, status: state.current ? "ended" : "idle" };
}

/** Pure, immutable reducer. Providers, storage, timers and randomness stay outside this function. */
export function reduceAudioSession(state: AudioSession, command: AudioCommand): AudioSession {
  switch (command.type) {
    case "reset":
      return { ...createAudioSession(command.owner), playbackRevision: state.playbackRevision + 1 };
    case "startContext": {
      const source = normalizePlaybackContext(command.context);
      if (!source || !Array.isArray(command.tracks) || !command.tracks.length
        || command.tracks.length > MAX_CONTEXT_TRACKS || !Number.isInteger(command.index)
        || command.index < 0 || command.index >= command.tracks.length) return state;
      const parsed = command.tracks.map(normalizeAudioTrack);
      // Reject invalid input rather than shifting the index and playing the wrong song.
      if (parsed.some((track) => track === null)) return state;
      const tracks = parsed as AudioTrack[];
      const revision = state.contextRevision + 1;
      const entries = contextEntries(state, tracks, source, revision);
      const remaining = entries.slice(command.index + 1);
      return select({ ...state, context: { source, tracks, revision }, contextRevision: revision,
        sequence: state.sequence + entries.length,
        userQueue: command.preserveUserQueue === false ? [] : state.userQueue,
        contextQueue: state.isShuffle ? shuffled(remaining, state.shuffleSeed) : remaining }, entries[command.index]);
    }
    case "enqueue": {
      const track = normalizeAudioTrack(command.track);
      if (!track || state.userQueue.length >= MAX_USER_QUEUE || !["next", "last"].includes(command.placement)) return state;
      const entry: QueueEntry = { entryId: `q${state.sequence + 1}`, track, origin: "user",
        source: normalizePlaybackContext(command.source), contextRevision: state.contextRevision, contextIndex: null };
      return { ...state, sequence: state.sequence + 1, userQueue: command.placement === "next"
        ? [entry, ...state.userQueue] : [...state.userQueue, entry] };
    }
    case "clearUserQueue":
      return state.userQueue.length ? { ...state, userQueue: [] } : state;
    case "remove": {
      const userQueue = state.userQueue.filter((entry) => entry.entryId !== command.entryId);
      const contextQueue = state.contextQueue.filter((entry) => entry.entryId !== command.entryId);
      return userQueue.length === state.userQueue.length && contextQueue.length === state.contextQueue.length
        ? state : { ...state, userQueue, contextQueue };
    }
    case "move": {
      if (command.entryId === command.beforeEntryId || !["user", "context"].includes(command.destination)) return state;
      const entry = [...state.userQueue, ...state.contextQueue].find((item) => item.entryId === command.entryId);
      if (!entry || (entry.origin === "user" && command.destination === "context")) return state;
      if (entry.origin !== "user" && command.destination === "user" && state.userQueue.length >= MAX_USER_QUEUE) return state;
      const userQueue = state.userQueue.filter((item) => item.entryId !== entry.entryId);
      const contextQueue = state.contextQueue.filter((item) => item.entryId !== entry.entryId);
      const target = command.destination === "user" ? userQueue : contextQueue;
      const index = command.beforeEntryId === null ? target.length : target.findIndex((item) => item.entryId === command.beforeEntryId);
      if (index < 0) return state;
      target.splice(index, 0, { ...entry, origin: command.destination });
      return { ...state, userQueue, contextQueue };
    }
    case "selectQueued": {
      const userIndex = state.userQueue.findIndex((entry) => entry.entryId === command.entryId);
      if (userIndex >= 0) return select({ ...state, userQueue: state.userQueue.filter((_, index) => index !== userIndex) }, state.userQueue[userIndex]);
      const index = state.contextQueue.findIndex((entry) => entry.entryId === command.entryId);
      if (index < 0) return state;
      return select({ ...state, contextQueue: state.contextQueue.slice(index + 1) }, state.contextQueue[index]);
    }
    case "advance":
      if (command.reason === "ended" && (!state.isPlaying || !matchesPlaybackToken(state, command.token))) return state;
      if (command.reason !== "ended" && command.reason !== "skip") return state;
      return advance(state, command.reason);
    case "previous": {
      if (!state.history.length) return state.current ? select(state, state.current, []) : state;
      const entry = state.history[state.history.length - 1];
      const queued = { ...state, history: state.history.slice(0, -1) };
      // Return the interrupted occurrence to its own priority tier for forward traversal.
      if (state.current?.origin === "user") queued.userQueue = [state.current, ...state.userQueue];
      else if (state.current) queued.contextQueue = [state.current, ...state.contextQueue];
      return select(queued, entry, queued.history);
    }
    case "setPlaying":
      if (typeof command.playing !== "boolean") return state;
      if (command.playing && !state.current) return advance(state, "skip");
      if (!state.current) return state;
      if (command.playing && ["ended", "error", "blocked"].includes(state.status)) return select(state, state.current, state.history);
      return { ...state, isPlaying: command.playing, status: command.playing ? "loading" : "paused", error: null };
    case "seek":
      return !state.current || !Number.isFinite(command.position) ? state : { ...state,
        position: boundedPosition(command.position, state.duration), seekRevision: state.seekRevision + 1 };
    case "progress": {
      if (!matchesPlaybackToken(state, command.token) || !Number.isFinite(command.position)) return state;
      const duration = Number.isFinite(command.duration) && command.duration! >= 0 ? command.duration! : state.duration;
      return { ...state, position: boundedPosition(command.position, duration), duration };
    }
    case "setVolume":
      return !Number.isFinite(command.volume) ? state : { ...state, volume: Math.min(1, Math.max(0, command.volume)) };
    case "setMuted":
      return typeof command.muted === "boolean" ? { ...state, isMuted: command.muted } : state;
    case "setRepeat":
      return ["off", "context", "track"].includes(command.mode) ? { ...state, repeatMode: command.mode } : state;
    case "setShuffle":
      if (typeof command.enabled !== "boolean" || !Number.isFinite(command.seed) || command.enabled === state.isShuffle) return state;
      return { ...state, isShuffle: command.enabled, shuffleSeed: command.seed >>> 0,
        contextQueue: command.enabled ? shuffled(state.contextQueue, command.seed)
          : state.contextQueue.slice().sort((a, b) => a.contextRevision - b.contextRevision || (a.contextIndex ?? 0) - (b.contextIndex ?? 0)) };
    case "appendContext": {
      if (!state.context || state.context.revision !== command.contextRevision || !Array.isArray(command.tracks)) return state;
      const seen = new Set(state.context.tracks.map((track) => `${track.provider}:${track.id}`));
      const tracks: AudioTrack[] = [];
      for (const input of command.tracks) {
        const track = normalizeAudioTrack(input);
        if (!track || seen.has(`${track.provider}:${track.id}`)) continue;
        seen.add(`${track.provider}:${track.id}`); tracks.push(track);
      }
      if (!tracks.length || state.context.tracks.length + tracks.length > MAX_CONTEXT_TRACKS) return state;
      const entries = contextEntries(state, tracks, state.context.source, state.context.revision, state.context.tracks.length);
      return { ...state, sequence: state.sequence + entries.length,
        context: { ...state.context, tracks: [...state.context.tracks, ...tracks] },
        contextQueue: [...state.contextQueue, ...(state.isShuffle ? shuffled(entries, state.shuffleSeed) : entries)] };
    }
    case "mediaStatus": {
      if (!matchesPlaybackToken(state, command.token)) return state;
      if (command.status === "playing") return state.isPlaying ? { ...state, status: "playing", error: null } : state;
      if (command.status === "paused") return !state.isPlaying ? { ...state, status: "paused" } : state;
      if (command.status !== "blocked" && command.status !== "error") return state;
      return { ...state, isPlaying: false, status: command.status,
        error: typeof command.message === "string" ? command.message.slice(0, 500) : "Playback could not start." };
    }
    default:
      return state;
  }
}
