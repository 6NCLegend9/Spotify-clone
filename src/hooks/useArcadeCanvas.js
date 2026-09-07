"use client";

import { useEffect, useRef } from "react";

/** Keeps a 2D canvas sized to its CSS box so lanes stay aligned. */
export default function useArcadeCanvas(canvasRef) {
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");

    const apply = (width, height) => {
      if (width < 8 || height < 8) return;
      const prev = sizeRef.current;
      if (prev.w > 0 && Math.abs(prev.w - width) < 2 && Math.abs(prev.h - height) < 2) return;
      sizeRef.current = { w: width, h: height };
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    apply(canvas.clientWidth, canvas.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) apply(box.width, box.height);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  return sizeRef;
}
