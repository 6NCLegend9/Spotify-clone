"use client";

import Homepage from "@/components/Homepage/Home";
import { useEffect, useState } from "react";

export default function HomeClient() {
  const [showtip, setShowtip] = useState(false);
  const [tutorialComplete, setTutorialComplete] = useState(false);

  useEffect(() => {
    const isComplete = localStorage.getItem("toturialComplete") === "true";
    setTutorialComplete(isComplete);
    if (isComplete) return undefined;

    const timer = window.setTimeout(() => setShowtip(true), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  const handleClick = () => {
    setShowtip(false);
    setTutorialComplete(true);
    localStorage.setItem("toturialComplete", "true");
  };

  return (
    <div className="relative">
      {showtip && !tutorialComplete && (
        <div className="fixed bottom-32 left-4 z-40 max-w-xs sm:left-8 lg:left-[284px]">
          <div className="rounded-2xl border border-white/10 bg-[#07121d] p-4 shadow-dock">
            <p className="text-sm text-gray-300">
              Create your own <span className="text-[#00e6e6]">Playlists</span>{" "}
              and add songs to <span className="text-[#00e6e6]">Liked Songs</span>.
            </p>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={handleClick} className="btn-primary h-9 px-4 text-sm">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
      <Homepage />
    </div>
  );
}
