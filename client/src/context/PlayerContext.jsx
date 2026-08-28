import { createContext, useContext } from "react";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useToast } from "./ToastContext";
import { useUser } from "./UserContext";
import { useLibrary } from "./LibraryContext";

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const { user, updateSettings } = useUser();
  const { notify } = useToast();
  const { invalidateRecommendations } = useLibrary();
  const player = useAudioPlayer({ serverSettings: user?.settings, onSettingsChange: updateSettings, onListeningEvent: invalidateRecommendations, notify });

  return <PlayerContext.Provider value={player}>
    {children}
    <audio ref={player.primaryAudioRef} crossOrigin="anonymous" preload="auto" onTimeUpdate={() => player.handleTimeUpdate(0)} onLoadedMetadata={() => player.handleLoadedMetadata(0)} onEnded={() => player.handleEnded(0)} onError={() => player.handleAudioError(0)} />
    <audio ref={player.secondaryAudioRef} crossOrigin="anonymous" preload="auto" onTimeUpdate={() => player.handleTimeUpdate(1)} onLoadedMetadata={() => player.handleLoadedMetadata(1)} onEnded={() => player.handleEnded(1)} onError={() => player.handleAudioError(1)} />
  </PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside PlayerProvider");
  return context;
}
