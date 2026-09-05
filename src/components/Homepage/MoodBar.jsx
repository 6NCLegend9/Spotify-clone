"use client";

import { useRouter } from "next/navigation";
import { MOOD_OPTIONS } from "@/utils/moods";

export default function MoodBar() {
  const router = useRouter();
  return (
    <div className="mb-8" role="group" aria-label="Mood radio">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9aa8b5]">Mood radio</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
        {MOOD_OPTIONS.map((mood) => (
          <button
            key={mood.id}
            type="button"
            onClick={() => router.push(`/search/${encodeURIComponent(mood.query)}`)}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-[#00e6e6] hover:text-[#00e6e6] active:scale-[0.98]"
          >
            {mood.label}
          </button>
        ))}
      </div>
    </div>
  );
}
