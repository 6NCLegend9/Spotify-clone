"use client";
import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { setLanguages } from "@/redux/features/languagesSlice";

// Mirrors SettingsSync.jsx: pulls the account's saved language preference on login,
// and pushes local changes back so the preference follows the account across devices
// (previously UserData.language was declared in the schema but never read or written).
const LanguageSync = () => {
  const dispatch = useDispatch();
  const { status } = useSession();
  const languages = useSelector((state) => state.languages.languages);
  const hydratedRef = useRef(false);
  const skipNextPushRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    fetch("/api/language")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json?.authenticated && Array.isArray(json.language) && json.language.length > 0) {
          skipNextPushRef.current = true;
          dispatch(setLanguages(json.language));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, dispatch]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    fetch("/api/language", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: languages }),
    }).catch(() => {});
  }, [languages, status]);

  return null;
};

export default LanguageSync;
