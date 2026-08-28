import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

const UserContext = createContext(null);

function mergeSettings(current = {}, patch = {}) {
  return {
    ...current,
    ...patch,
    equalizer: { ...current.equalizer, ...patch.equalizer },
  };
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profileStats, setProfileStats] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const saveTimer = useRef(null);
  const pendingSettings = useRef({});

  const applyUser = (nextUser) => {
    setUser(nextUser);
    setError("");
    setStatus("ready");
    return nextUser;
  };

  const loginDemo = async () => {
    const response = await api.post("/api/auth/demo-login");
    return applyUser(response.user);
  };

  const refreshProfile = async () => {
    const response = await api.get("/api/auth/me");
    setProfileStats(response.stats || null);
    return applyUser(response.user);
  };

  const updateProfile = async (patch) => {
    const response = await api.patch("/api/auth/me", patch);
    return applyUser(response.user);
  };

  const updateSettings = (patch) => {
    setUser((current) => current ? { ...current, settings: mergeSettings(current.settings, patch) } : current);
    pendingSettings.current = mergeSettings(pendingSettings.current, patch);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const settingsToSave = pendingSettings.current;
        pendingSettings.current = {};
        const response = await api.patch("/api/auth/me/settings", settingsToSave);
        applyUser(response.user);
      } catch {
        setError("Settings could not be saved. Your local playback choices are still active.");
      }
    }, 450);
  };

  const logout = async () => {
    window.clearTimeout(saveTimer.current);
    pendingSettings.current = {};
    await api.post("/api/auth/logout");
    setUser(null);
    setProfileStats(null);
    setStatus("ready");
  };

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const session = await api.get("/api/auth/session");
        const nextUser = session.user || (await api.post("/api/auth/demo-login")).user;
        if (active) applyUser(nextUser);
      } catch {
        if (active) {
          setError("The demo session is unavailable. Start the local API to use saved data.");
          setStatus("ready");
        }
      }
    };
    initialize();
    return () => {
      active = false;
      window.clearTimeout(saveTimer.current);
    };
  }, []);

  return <UserContext.Provider value={{ user, profileStats, status, error, loginDemo, logout, refreshProfile, updateProfile, updateSettings }}>
    {children}
  </UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used inside UserProvider");
  return context;
}