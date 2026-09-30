"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  PHONE_PORTRAIT_QUERY,
  PHONE_QUERY,
  initialMediaQueryMatch,
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
    ), [query]);

  const subscribe = useCallback((notify) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return noopUnsubscribe;
    }

    const media = window.matchMedia(query);
    const onChange = () => notify();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }

    media.addListener?.(onChange);
    return () => media.removeListener?.(onChange);
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useMediaQuery;

export function useIsMobile() {
  return useMediaQuery(PHONE_PORTRAIT_QUERY);
}

export const PHONE_VIEWPORT_QUERY = PHONE_QUERY;

export function useIsPhoneViewport() {
  return useMediaQuery(PHONE_QUERY);
}
