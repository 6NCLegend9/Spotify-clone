"use client";

import { useEffect, useState } from "react";
import { canWriteAccountCache } from "@/utils/accountStorage.mjs";
import { LIBRARY_SORTS } from "@/utils/libraryPresentation.mjs";

export default function useLibraryPresentation(owner, surface = "page") {
  const initial = { sort: "recents", view: surface === "sidebar" ? "list" : "grid" };
  const key = `heykasa.library.view:${owner || "guest"}:${surface}`;
  const [preferences, setPreferences] = useState(initial);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(key) || "null");
      if (saved) setPreferences({
        sort: LIBRARY_SORTS.some(([sort]) => sort === saved.sort) ? saved.sort : "recents",
        view: ["list", "grid"].includes(saved.view) ? saved.view : surface === "sidebar" ? "list" : "grid",
      });
    } catch { /* Browsers with storage disabled still support local view changes. */ }
  }, [key, surface]);
  const change = (field, value) => {
    const next = { ...preferences, [field]: value };
    setPreferences(next);
    try { if (canWriteAccountCache(owner || "guest")) window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* Storage is optional. */ }
  };
  return { ...preferences, setSort: (sort) => change("sort", sort), setView: (view) => change("view", view) };
}
