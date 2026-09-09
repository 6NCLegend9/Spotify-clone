"use client";

import { useEffect, useRef } from "react";
import { useAccessibilityPreferences } from "@/components/AccessibilityPreferences";

let grainUrl = "";

function getGrainUrl() {
  if (grainUrl) return grainUrl;
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const pixels = ctx.createImageData(96, 96);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const value = Math.random() * 255;
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
    pixels.data[index + 3] = 40;
  }
  ctx.putImageData(pixels, 0, 0);
  grainUrl = canvas.toDataURL("image/png");
  return grainUrl;
}

export default function Atmosphere() {
  const { preferences } = useAccessibilityPreferences();
  const reducedMotion = preferences?.reducedMotion;
  const glowRef = useRef(null);
  const grainRef = useRef(null);

  useEffect(() => {
    if (!grainRef.current) return;
    grainRef.current.style.backgroundImage = `url("${getGrainUrl()}")`;
  }, []);

  useEffect(() => {
    const glow = glowRef.current;
    const stage = glow?.closest(".app-stage");
    if (!glow || !stage) return undefined;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const reduced =
      reducedMotion
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (coarse || reduced) return undefined;

    let frame = 0;
    let rect = stage.getBoundingClientRect();
    const syncRect = () => {
      rect = stage.getBoundingClientRect();
    };

    const onMove = (event) => {
      if (document.documentElement.classList.contains("is-scrolling")) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        glow.style.transform = `translate3d(${event.clientX - rect.left}px, ${event.clientY - rect.top}px, 0)`;
      });
    };

    stage.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", syncRect, { passive: true });
    return () => {
      stage.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", syncRect);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  return (
    <div className="app-atmosphere" aria-hidden="true">
      <div className="app-atmosphere-wash" />
      <div className="app-atmosphere-orb app-atmosphere-orb--a" />
      <div className="app-atmosphere-orb app-atmosphere-orb--b" />
      <div className="app-atmosphere-orb app-atmosphere-orb--c" />
      <div className="app-atmosphere-glow" ref={glowRef} />
      <div className="app-atmosphere-grain" ref={grainRef} />
    </div>
  );
}
