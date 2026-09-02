"use client";

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateSetting } from "@/redux/features/settingsSlice";
import {
  ANALYTICS_CONSENT,
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_KEY,
  isAnalyticsRuntimeEnabled,
  readAnalyticsConsent,
  writeAnalyticsConsent,
} from "@/utils/analyticsConsent";

const GOOGLE_ANALYTICS_ID = "G-Z4FJ5T627Q";
const SIMPLE_ANALYTICS_SRC = "https://scripts.simpleanalyticscdn.com/latest.js";
const GOOGLE_ANALYTICS_SRC =
  `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;

function loadScript({ id, src }) {
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.body.appendChild(script);
  return script;
}

export default function AnalyticsConsent() {
  const dispatch = useDispatch();
  const usageAnalytics = useSelector((state) => state.settings.tailoredAds);
  const [choice, setChoice] = useState(undefined);

  useEffect(() => {
    const handleConsentChange = (event) => {
      setChoice(event.detail);
    };
    const handleStorage = (event) => {
      if (event.key === ANALYTICS_CONSENT_KEY) {
        setChoice(readAnalyticsConsent());
      }
    };

    window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsentChange);
    window.addEventListener("storage", handleStorage);
    setChoice(readAnalyticsConsent());

    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsentChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (choice === undefined) return;

    const consented = choice === ANALYTICS_CONSENT.accepted;
    if (usageAnalytics !== consented) {
      dispatch(updateSetting({ key: "tailoredAds", value: consented }));
    }
  }, [choice, dispatch, usageAnalytics]);

  useEffect(() => {
    if (choice !== ANALYTICS_CONSENT.accepted) return undefined;
    if (!isAnalyticsRuntimeEnabled({
      hostname: window.location.hostname,
    })) return undefined;

    window[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    window.gtag("js", new Date());

    const simpleAnalyticsScript = loadScript({
      id: "simple-analytics",
      src: SIMPLE_ANALYTICS_SRC,
    });
    const googleAnalyticsScript = loadScript({
      id: "google-analytics-loader",
      src: GOOGLE_ANALYTICS_SRC,
    });
    window.gtag("config", GOOGLE_ANALYTICS_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    return () => {
      window[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = true;
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", { analytics_storage: "denied" });
      }
      simpleAnalyticsScript.remove();
      googleAnalyticsScript.remove();
    };
  }, [choice]);

  if (choice !== null) return null;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="analytics-consent-title"
      aria-describedby="analytics-consent-description"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-xl border border-white/20 bg-[#101b29] p-5 text-white shadow-2xl sm:p-6"
    >
      <h2 id="analytics-consent-title" className="text-lg font-semibold">
        Optional usage analytics
      </h2>
      <p
        id="analytics-consent-description"
        className="mt-2 text-sm leading-6 text-[#c9d4de]"
      >
        With your permission, Google Analytics and Simple Analytics help us
        understand aggregate usage and service performance. They are not used
        for advertising. You can change this choice later in Settings.
      </p>
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => writeAnalyticsConsent(ANALYTICS_CONSENT.necessary)}
          className="min-h-11 rounded-md border border-white/25 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00e6e6]"
        >
          Necessary only
        </button>
        <button
          type="button"
          onClick={() => writeAnalyticsConsent(ANALYTICS_CONSENT.accepted)}
          className="min-h-11 rounded-md bg-[#00e6e6] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[#4df0f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Accept
        </button>
      </div>
    </section>
  );
}
