"use client";

import { useEffect, useRef } from "react";
import { useAccessibilityPreferences } from "@/components/AccessibilityPreferences";

const PALETTE = ["#00e6e6", "#64c9d7", "#7b5cff", "#ff4d8d", "#ffe066"];

function spawnBurst(x, y, count = 16) {
  const sparks = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = 1.6 + Math.random() * 3.4;
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.018 + Math.random() * 0.02,
      size: 1.4 + Math.random() * 2.4,
      color: PALETTE[i % PALETTE.length],
    });
  }
  return sparks;
}

export default function ParticleField() {
  const canvasRef = useRef(null);
  const { preferences } = useAccessibilityPreferences();
  const reduced = preferences?.reducedMotion || preferences?.highContrast;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduced) return undefined;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return undefined;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
    const count = coarse ? 22 : lowEnd ? 32 : 56;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1 : 1.25);

    const particles = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00055,
      vy: (Math.random() - 0.5) * 0.00045,
      r: 0.8 + Math.random() * 1.8,
      hue: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    }));

    const mouse = { x: 0.5, y: 0.35, live: false };
    const trail = [];
    let sparks = [];
    let frame = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const stage = canvas.parentElement;
      width = stage?.clientWidth || window.innerWidth;
      height = stage?.clientHeight || window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (event.clientX - rect.left) / rect.width;
      mouse.y = (event.clientY - rect.top) / rect.height;
      mouse.live = true;
      trail.push({ x: mouse.x * width, y: mouse.y * height, life: 1 });
      if (trail.length > 18) trail.shift();
    };

    const burstAt = (x, y, count) => {
      sparks = sparks.concat(spawnBurst(x, y, count));
      if (sparks.length > 180) sparks = sparks.slice(-180);
    };

    const onClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("button, a, [role='button']")) return;
      const rect = canvas.getBoundingClientRect();
      burstAt(event.clientX - rect.left, event.clientY - rect.top, 16);
    };

    const onPlayBurst = () => {
      burstAt(mouse.x * width, mouse.y * height, 22);
    };

    const tick = () => {
      frame = window.requestAnimationFrame(tick);
      if (document.documentElement.classList.contains("is-scrolling")) return;
      ctx.clearRect(0, 0, width, height);

      for (const particle of particles) {
        if (mouse.live) {
          const dx = mouse.x - particle.x;
          const dy = mouse.y - particle.y;
          particle.vx += dx * 0.00008;
          particle.vy += dy * 0.00008;
        }
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.986;
        particle.vy *= 0.986;
        if (particle.x < 0 || particle.x > 1) particle.vx *= -1;
        if (particle.y < 0 || particle.y > 1) particle.vy *= -1;
        particle.x = Math.min(1, Math.max(0, particle.x));
        particle.y = Math.min(1, Math.max(0, particle.y));
      }

      ctx.lineWidth = 0.7;
      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i];
        const ax = a.x * width;
        const ay = a.y * height;
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j];
          const dx = (a.x - b.x) * width;
          const dy = (a.y - b.y) * height;
          const dist = Math.hypot(dx, dy);
          if (dist > 110) continue;
          ctx.strokeStyle = `rgba(0, 230, 230, ${0.16 * (1 - dist / 110)})`;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(b.x * width, b.y * height);
          ctx.stroke();
        }
        ctx.fillStyle = a.hue;
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.arc(ax, ay, a.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      for (let i = trail.length - 1; i >= 0; i -= 1) {
        const point = trail[i];
        point.life -= 0.045;
        if (point.life <= 0) {
          trail.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `rgba(0, 230, 230, ${point.life * 0.35})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5 * point.life, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.x += spark.vx;
        spark.y += spark.vy;
        spark.vy += 0.04;
        spark.life -= spark.decay;
        if (spark.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.fillStyle = spark.color;
        ctx.globalAlpha = spark.life;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size * spark.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    resize();
    frame = window.requestAnimationFrame(tick);
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("click", onClick, true);
    window.addEventListener("heykasa:play-burst", onPlayBurst);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("heykasa:play-burst", onPlayBurst);
    };
  }, [reduced]);

  if (reduced) return null;

  return <canvas ref={canvasRef} className="app-particle-field" aria-hidden="true" />;
}
