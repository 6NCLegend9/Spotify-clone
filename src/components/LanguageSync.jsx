"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { setLanguages } from "@/redux/features/languagesSlice";
import { requestJson } from "@/services/http";
import useAccountScope from "@/hooks/useAccountScope";

const SYNC_ERROR_TOAST_ID = "account-preferences-sync-error";
const DEFAULT_LANGUAGE = ["english"];

function notifySyncFailure() {
  toast.error("Some account preferences couldn't sync. Your choices on this device are still available.", {
    id: SYNC_ERROR_TOAST_ID,
  });
}

export default function LanguageSync() {
  const scope = useAccountScope();
  const languages = useSelector((state) => state.languages.languages);
  // Only a known guest's choices may survive a login/logout cycle. Persisted
  // account preferences have no owner metadata and must not seed another account.
  const guestLanguagesRef = useRef(scope.status === "unauthenticated" ? languages : DEFAULT_LANGUAGE);
  return <AccountLanguageSync key={scope.key} scope={scope} guestLanguagesRef={guestLanguagesRef} />;
}

function AccountLanguageSync({ scope, guestLanguagesRef }) {
  const dispatch = useDispatch();
  const languages = useSelector((state) => state.languages.languages);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const skipNextPushRef = useRef(true);
  const readyToPushRef = useRef(false);
  const controllerRef = useRef(null);

  // Redux is shared by screens outside this component. Clear the preceding
  // account's value before paint, while its replacement preference is loading.
  useLayoutEffect(() => {
    dispatch(setLanguages(scope.status === "unauthenticated" ? guestLanguagesRef.current : DEFAULT_LANGUAGE));
  }, [dispatch, scope.status, guestLanguagesRef]);

  useEffect(() => {
    if (scope.status !== "authenticated" || !scopeRef.current.isCurrent()) return undefined;
    const controller = new AbortController();
    controllerRef.current = controller;
    let active = true;
    const isCurrent = () => active && scopeRef.current.isCurrent();
    requestJson("/api/language", {
      signal: controller.signal,
      fallbackTitle: "Preferences couldn't sync",
      fallbackMessage: "Some account preferences couldn't sync.",
    })
      .then((json) => {
        if (!isCurrent()) return;
        if (json?.authenticated !== true || (json.language !== null && !Array.isArray(json.language))) {
          throw new Error("Language sync did not return usable data.");
        }
        readyToPushRef.current = true;
        if (Array.isArray(json.language)) {
          skipNextPushRef.current = true;
          dispatch(setLanguages(json.language));
        }
      })
      .catch(() => { if (isCurrent()) notifySyncFailure(); });
    return () => {
      active = false;
      readyToPushRef.current = false;
      controller.abort();
    };
  }, [scope.status, dispatch]);

  useEffect(() => {
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    if (scope.status === "unauthenticated") {
      guestLanguagesRef.current = languages;
      return;
    }
    if (!readyToPushRef.current || !scopeRef.current.isCurrent()) return;
    const controller = controllerRef.current;
    requestJson("/api/language", {
      method: "PUT",
      signal: controller.signal,
      body: { language: languages },
      fallbackTitle: "Preferences couldn't sync",
      fallbackMessage: "Some account preferences couldn't sync.",
    })
      .then((json) => {
        if (!controller.signal.aborted && scopeRef.current.isCurrent() && json?.success !== true) {
          throw new Error("Language sync did not complete.");
        }
      })
      .catch(() => { if (!controller.signal.aborted && scopeRef.current.isCurrent()) notifySyncFailure(); });
  }, [languages, scope.status, guestLanguagesRef]);

  return null;
}
