"use client";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { hydrateSettings } from "@/redux/features/settingsSlice";

// Pulls the account's server-saved preferences (crossfade, quality, EQ, etc.) into Redux
// on login, so settings follow the user across devices/browsers instead of only reflecting
// whatever was last saved locally via redux-persist on this particular browser.
const SettingsSync = () => {
  const dispatch = useDispatch();
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json?.authenticated && json.settings) {
          dispatch(hydrateSettings(json.settings));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, dispatch]);

  return null;
};

export default SettingsSync;
