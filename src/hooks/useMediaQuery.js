"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  PHONE_QUERY,
  COMPACT_TOUCH_QUERY,
  initialMediaQueryMatch,
  nativeAndroidPhoneLayout,
} from "@/utils/responsivePolicy.mjs";

const getServerSnapshot = () => false;
const noopUnsubscribe = () => {};

export function useMediaQuery(query) {
  const getSnapshot = useCallback(() =>
    initialMediaQueryMatch(
      query,
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia.bind(window)
        : undefined,
    ) || ([PHONE_QUERY, COMPACT_TOUCH_QUERY].includes(query) && typeof window !== "undefined" && nativeAndroidPhoneLayout({
      userAgent: window.navigator.userAgent,
      width: window.innerWidth, height: window.innerHeight,
      screenWidth: window.screen?.width, screenHeight: window.screen?.height,
    })), [query]);

  const subscribe = useCallback((notify) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return noopUnsubscribe;
    }

    const media = window.matchMedia(query);
    const onChange = () => notify();
    // Native phone identity may remain the same while width/pointer queries
    // change independently during rotation or keyboard transitions.
    const nativePhoneQuery = query === PHONE_QUERY || query === COMPACT_TOUCH_QUERY;
    if (nativePhoneQuery) window.addEventListener("resize", onChange);
    const removeResize = () => { if (nativePhoneQuery) window.removeEventListener("resize", onChange); };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => { media.removeEventListener("change", onChange); removeResize(); };
    }

    media.addListener?.(onChange);
    return () => { media.removeListener?.(onChange); removeResize(); };
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useMediaQuery;

export function useIsPhoneViewport() {
  return useMediaQuery(PHONE_QUERY);
}
