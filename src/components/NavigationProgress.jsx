"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useDispatch } from "react-redux";
import { setProgress } from "@/redux/features/loadingBarSlice";

export default function NavigationProgress() {
  const pathname = usePathname();
  const dispatch = useDispatch();
  const first = useRef(true);

  useEffect(() => {
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || link.target && link.target !== "_self") return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url;
      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      dispatch(setProgress(42));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dispatch]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dispatch(setProgress(100));
  }, [pathname, dispatch]);

  return null;
}
