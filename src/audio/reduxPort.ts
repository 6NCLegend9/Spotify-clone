import type { AudioSession, AudioSessionStore } from "./types";
import { audioCommand } from "./reducer";

export interface ReduxStorePort<RootState> {
  getState(): RootState;
  dispatch(action: ReturnType<typeof audioCommand>): unknown;
  subscribe(listener: () => void): () => void;
}

/** Adapter only: no new global store and no copy of Redux playback state. */
export function createReduxAudioPort<RootState>(store: ReduxStorePort<RootState>, selectSession: (state: RootState) => AudioSession): AudioSessionStore {
  return {
    getState: () => selectSession(store.getState()),
    dispatch: (command) => { store.dispatch(audioCommand(command)); },
    subscribe: (listener) => {
      let previous = selectSession(store.getState());
      return store.subscribe(() => {
        const current = selectSession(store.getState());
        if (current !== previous) { previous = current; listener(); }
      });
    },
  };
}
