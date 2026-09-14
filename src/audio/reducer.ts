import type { AudioCommand, AudioSession } from "./types";
import { createAudioSession, reduceAudioSession } from "./session";
import { normalizeAudioSnapshot } from "./snapshot";

export const AUDIO_COMMAND = "player/audioSessionCommand";
export const AUDIO_RESTORE = "player/restoreAudioSession";

export const audioCommand = (command: AudioCommand) => ({ type: AUDIO_COMMAND, payload: command } as const);
export const restoreAudioSession = (owner: string, snapshot: unknown) => ({ type: AUDIO_RESTORE, payload: { owner, snapshot } } as const);

interface SessionAction { type: string; payload?: unknown; }

/**
 * Redux-compatible domain reducer for the existing player slice's eventual session field.
 * Deliberately NOT registered as a second global player alongside the legacy controller.
 * The transport migration must switch ownership and the compatibility selectors together.
 */
export default function audioSessionReducer(state: AudioSession = createAudioSession(), action: SessionAction): AudioSession {
  if (action.type === AUDIO_RESTORE) {
    if (!action.payload || typeof action.payload !== "object") return state;
    const { owner, snapshot } = action.payload as ReturnType<typeof restoreAudioSession>["payload"];
    if (typeof owner !== "string" || !owner.trim() || owner.length > 500) return state;
    const restored = normalizeAudioSnapshot(snapshot, owner);
    // Even a stale callback for an identical track cannot match a new hydration epoch.
    return { ...(restored || createAudioSession(owner)),
      playbackRevision: Math.max(state.playbackRevision, restored?.playbackRevision || 0) + 1 };
  }
  if (action.type === AUDIO_COMMAND && action.payload && typeof action.payload === "object"
    && "type" in action.payload && typeof action.payload.type === "string") {
    return reduceAudioSession(state, action.payload as AudioCommand);
  }
  return state;
}
