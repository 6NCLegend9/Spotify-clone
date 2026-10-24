"use client";

import { Lock as FiLock, Play as FiPlay } from "lucide-react";
import { ARCADE_GAMES } from "@/components/Arcade/arcadeGames";

export default function ArcadeGameSelect({ onSelect }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#096192]">Choose your game</p>
        <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">What do you want to play?</h2>
        <p className="mt-2 text-sm text-[#9aa8b5]">
          All three modes share one song chart. Catch, dodge, or fire on the beat — not on a random timer.
        </p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ARCADE_GAMES.map((game) => (
            <li key={game.id}>
              <button
                type="button"
                disabled={!game.ready}
                onClick={() => onSelect(game.id)}
                aria-describedby={game.ready ? undefined : `${game.id}-unavailable`}
                className={`group flex h-full w-full flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${
                  game.ready
                    ? "border-white/12 bg-white/[0.04] hover:border-[#096192] hover:bg-[#096192]/[0.06]"
                    : "cursor-not-allowed border-white/8 bg-white/[0.02] opacity-50"
                }`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#ffb648]">
                    {game.tagline}
                  </span>
                  {game.ready ? (
                    <FiPlay size="1em" fill="currentColor" aria-hidden="true" className="text-[#096192]" />
                  ) : (
                    <FiLock size="1em" aria-hidden="true" className="text-[#9aa8b5]" />
                  )}
                </span>
                <span className="text-base font-bold text-white">{game.title}</span>
                <span className="text-xs leading-5 text-[#9aa8b5]">{game.blurb}</span>
                {game.ready ? null : (
                  <span id={`${game.id}-unavailable`} className="mt-1 text-[11px] font-semibold text-[#9aa8b5]">
                    Coming soon
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
