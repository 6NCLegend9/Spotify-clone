"use client";

import { useEffect, useState } from "react";
import { getArcadeGame } from "@/components/Arcade/arcadeGames";

function detectTouch() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

export default function HowToPlayOverlay({ mode = "tiles", onStart, canStart = true, children }) {
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    setTouch(detectTouch());
  }, []);

  useEffect(() => {
    if (!canStart) return undefined;
    const onKeyDown = (event) => {
      if (event.code !== "Space" && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      onStart();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [canStart, onStart]);

  const guide = getArcadeGame(mode);
  const steps = touch ? guide.mobile : guide.desktop;

  return (
    <div className="h-full overflow-y-auto bg-[#04070d] px-4 py-6 sm:px-6">
      <div className="mx-auto grid max-w-3xl gap-5 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#00e6e6]">How to play</p>
          <h2 className="mt-2 text-2xl font-bold text-white">{guide.title}</h2>
          <p className="mt-2 text-sm text-[#9aa8b5]">{guide.blurb}</p>

          <ul className="mt-4 flex flex-col gap-2">
            {steps.map((step) => (
              <li key={step} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-gray-200">
                {step}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="btn-primary mt-5 min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {touch ? "Tap to start" : "Press Space to start"}
          </button>

          <button
            type="button"
            onClick={() => setTouch((value) => !value)}
            className="mt-3 min-h-11 text-[11px] text-[#9aa8b5] underline underline-offset-4 hover:text-white"
          >
            Show {touch ? "keyboard" : "touch"} controls instead
          </button>
        </div>

        <div>{children}</div>
      </div>
    </div>
  );
}
