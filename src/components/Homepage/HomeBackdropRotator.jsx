"use client";

import { useEffect, useState } from "react";

const BACKDROPS = [
  {
    src: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=2400&q=82",
    position: "center 35%",
  },
  {
    src: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=2400&q=82",
    position: "center",
  },
  {
    src: "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=2400&q=82",
    position: "center",
  },
  {
    src: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=2400&q=82",
    position: "center",
  },
];

const ROTATION_MS = 20_000;

export default function HomeBackdropRotator() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % BACKDROPS.length);
    }, ROTATION_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {BACKDROPS.map((backdrop, index) => (
        <div
          key={backdrop.src}
          className="absolute inset-0 bg-cover transition-opacity duration-[1800ms] ease-in-out motion-reduce:transition-none"
          style={{
            backgroundImage: `url("${backdrop.src}")`,
            backgroundPosition: backdrop.position,
            opacity: index === activeIndex ? 0.26 : 0,
          }}
        />
      ))}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,8,20,0.42),rgba(0,8,20,0.84)_70%,rgba(0,8,20,0.96)),linear-gradient(90deg,rgba(0,0,0,0.62),transparent_48%,rgba(0,45,50,0.28))]" />
    </div>
  );
}
