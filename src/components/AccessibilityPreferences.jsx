"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "heykasa-accessibility-preferences";
const DEFAULT_PREFERENCES = {
  highContrast: false,
  largeText: false,
  reducedMotion: false,
};
const PREFERENCE_KEYS = new Set(Object.keys(DEFAULT_PREFERENCES));

const AccessibilityPreferencesContext = createContext(null);

function normalizePreferences(value) {
  return {
    highContrast: value?.highContrast === true,
    largeText: value?.largeText === true,
    reducedMotion: value?.reducedMotion === true,
  };
}

function getStoredPreferences() {
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (!storedValue) {
      return { preferences: { ...DEFAULT_PREFERENCES }, storageAvailable: true };
    }
    try {
      return {
        preferences: normalizePreferences(JSON.parse(storedValue)),
        storageAvailable: true,
      };
    } catch {
      return { preferences: { ...DEFAULT_PREFERENCES }, storageAvailable: true };
    }
  } catch {
    return { preferences: { ...DEFAULT_PREFERENCES }, storageAvailable: false };
  }
}

function applyPreferences(preferences) {
  const root = document.documentElement;
  root.dataset.a11yContrast = preferences.highContrast ? "high" : "default";
  root.dataset.a11yTextSize = preferences.largeText ? "large" : "default";
  root.dataset.a11yReducedMotion = preferences.reducedMotion ? "true" : "false";
}

export function AccessibilityPreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [isReady, setIsReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState("loading");

  useEffect(() => {
    const stored = getStoredPreferences();
    applyPreferences(stored.preferences);
    setPreferences(stored.preferences);
    setStorageStatus(stored.storageAvailable ? "saved" : "unavailable");
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    applyPreferences(preferences);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      setStorageStatus("saved");
    } catch {
      setStorageStatus("unavailable");
    }
  }, [isReady, preferences]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== STORAGE_KEY) return;
      if (!event.newValue) {
        setPreferences({ ...DEFAULT_PREFERENCES });
        return;
      }
      try {
        setPreferences(normalizePreferences(JSON.parse(event.newValue)));
      } catch {
        setPreferences({ ...DEFAULT_PREFERENCES });
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const updatePreference = (key, value) => {
    if (!PREFERENCE_KEYS.has(key)) return;
    setPreferences((current) => ({ ...current, [key]: Boolean(value) }));
  };

  const resetPreferences = () => {
    setPreferences({ ...DEFAULT_PREFERENCES });
  };

  return (
    <AccessibilityPreferencesContext.Provider
      value={{
        isReady,
        preferences,
        resetPreferences,
        storageStatus,
        updatePreference,
      }}
    >
      {children}
    </AccessibilityPreferencesContext.Provider>
  );
}

export function useAccessibilityPreferences() {
  const context = useContext(AccessibilityPreferencesContext);
  if (!context) {
    throw new Error("useAccessibilityPreferences must be used inside AccessibilityPreferencesProvider");
  }
  return context;
}