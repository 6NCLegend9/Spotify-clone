"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export default useMediaQuery;

export function useIsMobile() {
  return useMediaQuery("(max-width: 767px)");
}

/** Phone portrait, or a phone rotated to landscape (short side still phone-sized). */
export const PHONE_VIEWPORT_QUERY =
  "(max-width: 767px), (orientation: landscape) and (max-height: 540px) and (max-width: 1100px)";

export function useIsPhoneViewport() {
  return useMediaQuery(PHONE_VIEWPORT_QUERY);
}
