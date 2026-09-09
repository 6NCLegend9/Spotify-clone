"use client";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";
import { hydrateSettings } from "@/redux/features/settingsSlice";
import { requestJson } from "@/services/http";
import { clearNavCache } from "@/utils/navCache";

const SYNC_ERROR_TOAST_ID = "account-preferences-sync-error";

function notifySyncFailure() {
  toast.error("Some account preferences couldn't sync. Your choices on this device are still available.", {
    id: SYNC_ERROR_TOAST_ID,
  });
}

// Pulls the account's server-saved preferences (quality, EQ, etc.) into Redux
// on login, so settings follow the user across devices/browsers instead of only reflecting
// whatever was last saved locally via redux-persist on this particular browser.
const SettingsSync = () => {
  const dispatch = useDispatch();
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      clearNavCache();
      return;
    }
    if (status !== "authenticated") return;
    let cancelled = false;
    const controller = new AbortController();
    requestJson("/api/settings", {
      signal: controller.signal,
      fallbackTitle: "Preferences couldn't sync",
      fallbackMessage: "Some account preferences couldn't sync.",
    })
      .then((json) => {
        if (!json || typeof json.authenticated !== "boolean") {
          throw new Error("Settings sync did not return usable data.");
        }
        if (!cancelled && json?.authenticated && json.settings) {
          dispatch(hydrateSettings(json.settings));
        }
      })
      .catch(() => {
        if (!cancelled) notifySyncFailure();
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [status, dispatch]);

  return null;
};

export default SettingsSync;
