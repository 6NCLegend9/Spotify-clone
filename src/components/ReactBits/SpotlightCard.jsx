"use client";

import { useRef, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const SpotlightCard = ({
  children,
  className = "",
  spotlightColor = "rgba(0, 230, 230, 0.2)",
}) => {
  const divRef = useRef(null);
  const isHovered = useRef(false);
  const position = useRef({ x: 0, y: 0 });
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return undefined;
    let frame = 0;
    const render = () => {
      if (divRef.current && isHovered.current) {
        divRef.current.style.setProperty("--x", `${position.current.x}px`);
        divRef.current.style.setProperty("--y", `${position.current.y}px`);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  return (
    <div
      ref={divRef}
      onMouseMove={(e) => {
        if (reduceMotion || !divRef.current) return;
        const rect = divRef.current.getBoundingClientRect();
        position.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }}
      onMouseEnter={() => {
        isHovered.current = true;
      }}
      onMouseLeave={() => {
        isHovered.current = false;
        if (divRef.current) {
          divRef.current.style.setProperty("--x", "-1000px");
          divRef.current.style.setProperty("--y", "-1000px");
        }
      }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl",
        className
      )}
    >
      {!reduceMotion ? (
        <motion.div
          className="pointer-events-none absolute -inset-px rounded-xl opacity-0"
          style={{
            background: `radial-gradient(600px circle at var(--x) var(--y), ${spotlightColor}, transparent 40%)`,
          }}
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        />
      ) : null}
      {children}
    </div>
  );
};
