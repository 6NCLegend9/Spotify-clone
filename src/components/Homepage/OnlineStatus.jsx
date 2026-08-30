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
    <div className="mb-5 flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-white">
      <RiWifiOffLine size={18} />
      Please check your internet connection.
      <button
        type="button"
        className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20"
        onClick={() => window.location.reload()}
      >
        Retry
      </button>
    </div>
  );
};

export default OnlineStatus;
