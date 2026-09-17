"use client";

import { useEffect } from "react";

const STORAGE_KEY = "heykasa:sleep-timer:v1";

export default function useSleepTimer() {
  useEffect(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return {
    timer: null,
    change: () => {},
    check: () => false,
  };
}
