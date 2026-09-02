import { isAnalyticsRuntimeEnabled } from "./analyticsRuntime.mjs";

export const ANALYTICS_CONSENT_KEY = "heykasa.analytics-consent";
export const ANALYTICS_CONSENT_EVENT = "heykasa:analytics-consent-change";

export const ANALYTICS_CONSENT = Object.freeze({
  accepted: "accepted",
  necessary: "necessary",
});

export { isAnalyticsRuntimeEnabled };

export function readAnalyticsConsent() {
  if (typeof window === "undefined") return null;

  try {
    const choice = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return Object.values(ANALYTICS_CONSENT).includes(choice) ? choice : null;
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(choice) {
  if (
    typeof window === "undefined"
    || !Object.values(ANALYTICS_CONSENT).includes(choice)
  ) {
    return;
  }

  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
  } catch {
    // Keep the in-page choice even if storage is unavailable.
  }

  window.dispatchEvent(
    new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: choice }),
  );
}
