"use client";
import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";
import { setLanguages } from "@/redux/features/languagesSlice";
import { requestJson } from "@/services/http";

const SYNC_ERROR_TOAST_ID = "account-preferences-sync-error";

function notifySyncFailure() {
  toast.error("Some account preferences couldn't sync. Your choices on this device are still available.", {
    id: SYNC_ERROR_TOAST_ID,
  });
}

// Mirrors SettingsSync.jsx: pulls the account's saved language preference on login,
// and pushes local changes back so the preference follows the account across devices
// (previously UserData.language was declared in the schema but never read or written).
const LanguageSync = () => {
  const dispatch = useDispatch();
  const { status } = useSession();
  const languages = useSelector((state) => state.languages.languages);
  const hydratedRef = useRef(false);
  const skipNextPushRef = useRef(false);
  const readyToPushRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") {
      hydratedRef.current = false;
      readyToPushRef.current = false;
      return;
    }
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    const controller = new AbortController();
    requestJson("/api/language", {
      signal: controller.signal,
      fallbackTitle: "Preferences couldn't sync",
      fallbackMessage: "Some account preferences couldn't sync.",
    })
      .then((json) => {
        if (!json || typeof json.authenticated !== "boolean") {
          throw new Error("Language sync did not return usable data.");
        }
        if (!cancelled && json?.authenticated && Array.isArray(json.language) && json.language.length > 0) {
          skipNextPushRef.current = true;
          dispatch(setLanguages(json.language));
        }
        if (!cancelled) readyToPushRef.current = true;
      })
      .catch(() => {
        if (!cancelled) notifySyncFailure();
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [status, dispatch]);

  useEffect(() => {
    if (status !== "authenticated" || !readyToPushRef.current) return;
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    requestJson("/api/language", {
      method: "PUT",
      body: { language: languages },
      fallbackTitle: "Preferences couldn't sync",
      fallbackMessage: "Some account preferences couldn't sync.",
    })
      .then((json) => {
        if (json?.success !== true) throw new Error("Language sync did not complete.");
      })
      .catch(() => notifySyncFailure());
  }, [languages, status]);

  return null;
};

export default LanguageSync;
