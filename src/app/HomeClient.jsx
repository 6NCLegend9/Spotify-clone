"use client";

import Homepage from "@/components/Homepage/Home";
import { useEffect, useLayoutEffect, useState } from "react";

export default function HomeClient() {
  const [showtip, setShowtip] = useState(false);
  const [toturialComplete, setToturialComplete] = useState(false);

  useLayoutEffect(() => {
    setToturialComplete(JSON.parse(localStorage.getItem("toturialComplete")));

    setTimeout(() => {
      if (!toturialComplete) {
        setShowtip(true);
      }
    }, 5000);
  }, []);

  useEffect(() => {}, [toturialComplete]);

  const handleClick = () => {
    setShowtip(false);
    setToturialComplete(true);
    localStorage.setItem("toturialComplete", true);
  };

  return (
    <div className="relative">
      {showtip && !toturialComplete && (
        <div className="fixed bottom-32 left-4 z-40 max-w-xs sm:left-8 lg:left-[284px]">
          <div className="rounded-2xl border border-white/10 bg-[#07121d] p-4 shadow-dock">
            <p className="text-sm text-gray-300">
              Create your own <span className="text-[#00e6e6]">Playlists</span>{" "}
              and add songs to <span className="text-[#00e6e6]">Liked Songs</span>.
            </p>
            <div className="mt-3 flex justify-end">
              <button onClick={handleClick} className="btn-primary h-9 px-4 text-sm">
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
