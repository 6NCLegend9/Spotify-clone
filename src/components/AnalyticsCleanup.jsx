"use client";

import { useEffect } from "react";

// Removes the retired "Optional usage analytics" consent flag from earlier versions.
const RETIRED_KEYS = ["heykasa.analytics-consent"];

export default function AnalyticsCleanup() {
  useEffect(() => {
    try {
      RETIRED_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // localStorage may be unavailable.
    }
  }, []);

  return null;
}
