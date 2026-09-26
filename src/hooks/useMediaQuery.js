"use client";

import { useEffect, useState } from "react";
import {
  PHONE_PORTRAIT_QUERY,
  PHONE_QUERY,
  initialMediaQueryMatch,
} from "@/utils/responsivePolicy.mjs";

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    initialMediaQueryMatch(
      query,
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia.bind(window)
        : undefined,
    ),
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setMatches(false);
      return undefined;
    }
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches === true);
    onChange();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener?.(onChange);
    return () => media.removeListener?.(onChange);
  }, [query]);

  return matches;
}

export default useMediaQuery;

export function useIsMobile() {
  return useMediaQuery(PHONE_PORTRAIT_QUERY);
}

export const PHONE_VIEWPORT_QUERY = PHONE_QUERY;

export function useIsPhoneViewport() {
  return useMediaQuery(PHONE_QUERY);
}
