"use client";

import { RiWifiOffLine } from "react-icons/ri";
import { useEffect, useState } from "react";

const OnlineStatus = () => {
  const [onLineStatus, setOnLineStatus] = useState(true);

  useEffect(() => {
    const checkOnline = () => setOnLineStatus(navigator.onLine);
    checkOnline();
    window.addEventListener("online", checkOnline);
    window.addEventListener("offline", checkOnline);
    return () => {
      window.removeEventListener("online", checkOnline);
      window.removeEventListener("offline", checkOnline);
    };
  }, []);

  if (onLineStatus) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-2 z-40 mx-3 mb-3 flex items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-[#221a08]/95 px-3 py-2 text-sm text-white shadow-xl backdrop-blur sm:mx-5"
    >
      <RiWifiOffLine size={18} aria-hidden="true" />
      You’re offline. Some music and account features are unavailable.
      <button
        type="button"
        className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20"
        onClick={() => {
          if (navigator.onLine) window.location.reload();
        }}
      >
        Check again
      </button>
    </div>
  );
};

export default OnlineStatus;
