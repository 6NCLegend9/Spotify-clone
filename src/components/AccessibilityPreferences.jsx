"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "heykasa-accessibility-preferences";
const DEFAULT_PREFERENCES = {
  highContrast: false,
  largeText: false,
  reducedMotion: false,
};

const AccessibilityPreferencesContext = createContext(null);

function normalizePreferences(value) {
  return {
    highContrast: Boolean(value?.highContrast),
    largeText: Boolean(value?.largeText),
    reducedMotion: Boolean(value?.reducedMotion),
  };
}

function getStoredPreferences() {
  try {
    return normalizePreferences(JSON.parse(window.localStorage.getItem(STORAGE_KEY)));
  } catch {
    return DEFAULT_PREFERENCES;
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

  useEffect(() => {
    setPreferences(getStoredPreferences());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    applyPreferences(preferences);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [isReady, preferences]);

  const updatePreference = (key, value) => {
    setPreferences((current) => ({ ...current, [key]: Boolean(value) }));
  };

  const resetPreferences = () => {
    setPreferences(DEFAULT_PREFERENCES);
  };

  return (
    <AccessibilityPreferencesContext.Provider
      value={{ isReady, preferences, resetPreferences, updatePreference }}
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