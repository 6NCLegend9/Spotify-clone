"use client";

import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { setYoutubeQueue } from "@/redux/features/playerSlice";
import { MOOD_OPTIONS } from "@/utils/moods";
import { applyMoodFilter } from "@/utils/radioEngine.mjs";

export default function MoodBar() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { youtubeQueue, youtubeVideo } = useSelector((state) => state.player);
  const [activeMood, setActiveMood] = useState(null);

  const handleMoodClick = (mood) => {
    if (activeMood === mood.id) {
      setActiveMood(null);
      router.push(`/search/${encodeURIComponent(mood.query)}`);
      return;
    }

    if (Array.isArray(youtubeQueue) && youtubeQueue.length > 0) {
      const reordered = applyMoodFilter(youtubeQueue, mood.id, { seedTrack: youtubeVideo });
      dispatch(setYoutubeQueue(reordered));
      setActiveMood(mood.id);
      toast.success(`Mood set: ${mood.label} · Queue tuned`);
    } else {
      setActiveMood(mood.id);
      router.push(`/search/${encodeURIComponent(mood.query)}`);
    }
  };

  return (
    <div className="mb-8" role="group" aria-label="Mood radio">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">Mood radio</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
        {MOOD_OPTIONS.map((mood) => {
          const isActive = activeMood === mood.id;
          return (
            <button
              key={mood.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => handleMoodClick(mood)}
              className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 py-2 text-sm font-semibold transition active:scale-[0.98] ${
                isActive
                  ? "border-[#00e6e6] bg-[#00e6e6]/15 text-[#00e6e6]"
                  : "border-white/15 text-gray-200 hover:border-[#00e6e6] hover:text-[#00e6e6]"
              }`}
            >
              {mood.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
