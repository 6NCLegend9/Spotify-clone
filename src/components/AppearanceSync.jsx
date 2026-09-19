"use client";

import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";
import {
  hydrateAppearance,
  markAppearanceUnavailable,
} from "@/redux/features/appearanceSlice";
import { getHeyKasaDesktopApi } from "@/utils/desktopEnvironment";

function missingBackgroundMessage(warning) {
  const fileName = typeof warning?.fileName === "string" && warning.fileName.trim()
    ? warning.fileName.trim()
    : "background image";
  return `Couldn’t find “${fileName}”. Choose it again or use the default background.`;
}

export default function AppearanceSync() {
  const dispatch = useDispatch();
  const lastWarningRef = useRef("");

  useEffect(() => {
    const api = getHeyKasaDesktopApi()?.appearance;
    if (!api?.get) {
      dispatch(markAppearanceUnavailable());
      return undefined;
    }
    let active = true;

    const apply = (payload) => {
      if (!active || !payload || typeof payload !== "object") return;
      dispatch(hydrateAppearance(payload));
      if (payload.warning?.code === "BACKGROUND_MISSING") {
        const message = missingBackgroundMessage(payload.warning);
        if (lastWarningRef.current !== message) {
          lastWarningRef.current = message;
          toast.error(message, { id: "appearance-background-missing", duration: 8000 });
        }
      } else {
        lastWarningRef.current = "";
      }
    };

    void api.get().then(apply).catch(() => {
      if (active) dispatch(markAppearanceUnavailable());
    });
    const unsubscribe = typeof api.onChanged === "function" ? api.onChanged(apply) : null;
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [dispatch]);

  return null;
}
