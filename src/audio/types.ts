/** Serializable domain state. No DOM nodes, media instances, credentials or signed media URLs. */
export type AudioProvider = "youtube" | "native";
export type RepeatMode = "off" | "context" | "track";
export type QueueOrigin = "user" | "context";
export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "blocked" | "error";

export interface AudioTrack {
  id: string;
  provider: AudioProvider;
  title: string;
  artist: string;
  thumbnail?: string;
  duration?: number;
  artistHref?: string;
  albumHref?: string;
}

export interface PlaybackContext {
  id: string;
  type: "playlist" | "album" | "artist" | "search" | "home" | "radio" | "unknown";
  name: string;
  href?: string;
}

export interface QueueEntry {
  /** Identifies an occurrence, not the song. Duplicate songs have different entryIds. */
  entryId: string;
  track: AudioTrack;
  origin: QueueOrigin;
  source: PlaybackContext | null;
  contextRevision: number;
  contextIndex: number | null;
}

export interface AudioSession {
  owner: string | null;
  current: QueueEntry | null;
  userQueue: QueueEntry[];
  contextQueue: QueueEntry[];
  context: { source: PlaybackContext; tracks: AudioTrack[]; revision: number } | null;
  history: QueueEntry[];
  position: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  isPlaying: boolean;
  status: PlaybackStatus;
  error: string | null;
  /** Monotonic occurrence allocator; deterministic across reducer replay. */
  sequence: number;
  contextRevision: number;
  shuffleSeed: number;
  /** Changes on selection/restart, even when two successive entries have the same song ID. */
  playbackRevision: number;
  /** Only a user seek changes this; timeupdate must not trigger another seek. */
  seekRevision: number;
}

export interface PlaybackToken {
  entryId: string;
  playbackRevision: number;
}

export type AudioCommand =
  | { type: "startContext"; tracks: AudioTrack[]; index: number; context: PlaybackContext; preserveUserQueue?: boolean }
  | { type: "enqueue"; track: AudioTrack; placement: "next" | "last"; source?: PlaybackContext }
  | { type: "move"; entryId: string; destination: QueueOrigin; beforeEntryId: string | null }
  | { type: "remove"; entryId: string }
  | { type: "clearUserQueue" }
  | { type: "selectQueued"; entryId: string }
  | { type: "advance"; reason: "skip" | "ended"; token?: PlaybackToken }
  | { type: "previous" }
  | { type: "setPlaying"; playing: boolean }
  | { type: "seek"; position: number }
  | { type: "progress"; token: PlaybackToken; position: number; duration?: number }
  | { type: "setVolume"; volume: number }
  | { type: "setMuted"; muted: boolean }
  | { type: "setRepeat"; mode: RepeatMode }
  | { type: "setShuffle"; enabled: boolean; seed: number }
  | { type: "appendContext"; tracks: AudioTrack[]; contextRevision: number }
  | { type: "mediaStatus"; token: PlaybackToken; status: "playing" | "paused" | "blocked" | "error"; message?: string }
  | { type: "reset"; owner: string | null };

export interface AudioSessionStore {
  getState(): AudioSession;
  dispatch(command: AudioCommand): void;
  subscribe(listener: () => void): () => void;
}

/** Provider adapters must abort pending work and tag every event with its original load token. */
export type AudioMediaEvent =
  | { type: "progress"; token: PlaybackToken; position: number; duration?: number }
  | { type: "ended"; token: PlaybackToken }
  | { type: "status"; token: PlaybackToken; status: "playing" | "paused" | "blocked" | "error"; message?: string };

export interface AudioAdapter {
  load(track: AudioTrack, options: { token: PlaybackToken; position: number; signal: AbortSignal }): Promise<void>;
  play(): void | Promise<void>;
  pause(): void;
  seek(position: number): void;
  setVolume(volume: number): void;
  subscribe(listener: (event: AudioMediaEvent) => void): () => void;
  /** Detaches only this controller's session; reuse of an adapter requires a new bind. */
  dispose(): void;
}

export interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
