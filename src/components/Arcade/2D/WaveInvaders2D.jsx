"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useArcadeCanvas from "@/hooks/useArcadeCanvas";
import { approachSeconds, chartEnergy, notesInWindow } from "@/utils/arcadeChart.mjs";

const LANES = 4;
const LANE_COLORS = ["#00e6e6", "#7c5cff", "#ff4ecd", "#ffb648"];
const LOCK_RATIO = 0.72;
const PERFECT_WINDOW = 0.09;
const GOOD_WINDOW = 0.18;
const HIT_WINDOW = 0.28;
const START_LIVES = 3;
const MISS_LIMIT = 10;

function audioFrame(analyzer, time, chart) {
  if (analyzer?.mode === "fft") return analyzer.read(performance.now());
  return chartEnergy(time, chart?.bpm || 120, chart?.offset || 0);
}

function laneLayout(width) {
  const pad = Math.max(16, width * 0.06);
  const inner = Math.max(1, width - pad * 2);
  return { pad, laneWidth: inner / LANES };
}

function laneCenter(width, lane) {
  const { pad, laneWidth } = laneLayout(width);
  return pad + lane * laneWidth + laneWidth / 2;
}

function laneFromX(width, x) {
  const { pad, laneWidth } = laneLayout(width);
  return Math.max(0, Math.min(LANES - 1, Math.floor((x - pad) / laneWidth)));
}

function noteKey(note) {
  return `${note.t}:${note.lane}`;
}

/**
 * Lane-locked pulse shooter. Each chart note is an orb that meets the ring
 * on the beat. A shot only counts if it is in that lane and in time.
 */
export default function WaveInvaders2D({
  analyzer,
  clock,
  chart,
  running,
  reducedMotion,
  onGameOver,
}) {
  const canvasRef = useRef(null);
  const sizeRef = useArcadeCanvas(canvasRef);
  const clockRef = useRef(clock);
  const analyzerRef = useRef(analyzer);
  const chartRef = useRef(chart);
  const reducedRef = useRef(reducedMotion);
  clockRef.current = clock;
  analyzerRef.current = analyzer;
  chartRef.current = chart;
  reducedRef.current = reducedMotion;
  const runningRef = useRef(running);
  const overRef = useRef(false);
  const gameOverRef = useRef(onGameOver);
  const stateRef = useRef({
    lane: 1,
    judged: new Set(),
    particles: [],
    beamUntil: 0,
    lastFrame: 0,
    points: 0,
    combo: 0,
    best: 0,
    hits: 0,
    misses: 0,
    lives: START_LIVES,
    popup: "",
    popupAt: 0,
    finished: false,
  });
  const [hud, setHud] = useState({ points: 0, combo: 0, lives: START_LIVES, hits: 0 });

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    gameOverRef.current = onGameOver;
  }, [onGameOver]);

  const finish = useCallback((detail) => {
    if (overRef.current) return;
    overRef.current = true;
    runningRef.current = false;
    const state = stateRef.current;
    gameOverRef.current?.({
      score: state.points,
      detail: detail || `${state.hits} pulses · ${state.best}x combo`,
    });
  }, []);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const moveLane = useCallback((direction) => {
    const state = stateRef.current;
    state.lane = Math.max(0, Math.min(LANES - 1, state.lane + direction));
  }, []);

  const fire = useCallback(() => {
    if (!runningRef.current) return;
    const notes = chartRef.current?.notes;
    if (!notes) return;
    const state = stateRef.current;
    const time = clockRef.current.getTime();
    const now = performance.now();
    state.beamUntil = now + 90;

    let best = null;
    let bestAbs = HIT_WINDOW;
    for (const note of notes) {
      if (note.lane !== state.lane || state.judged.has(noteKey(note))) continue;
      const delta = Math.abs(note.t - time);
      if (delta <= bestAbs) {
        best = note;
        bestAbs = delta;
      }
    }

    if (!best) {
      const upcoming = notes.find((note) => (
        note.lane === state.lane
        && !state.judged.has(noteKey(note))
        && note.t - time > 0
        && note.t - time < 0.55
      ));
      state.combo = 0;
      state.popup = upcoming ? "EARLY" : "";
      state.popupAt = now;
      setHud({ points: state.points, combo: 0, lives: state.lives, hits: state.hits });
      return;
    }

    state.judged.add(noteKey(best));
    const perfect = bestAbs <= PERFECT_WINDOW;
    const good = bestAbs <= GOOD_WINDOW;
    state.combo += 1;
    state.best = Math.max(state.best, state.combo);
    state.hits += 1;
    const base = best.kind === "accent" ? 180 : 100;
    state.points += (perfect ? base + 80 : good ? base + 30 : base) + Math.min(state.combo, 32) * 8;
    state.popup = perfect ? "PERFECT" : good ? "GOOD" : "OK";
    state.popupAt = now;
    state.particles.push({
      x: best.lane,
      y: 0.72,
      life: 1,
      color: LANE_COLORS[best.lane],
    });
    setHud({ points: state.points, combo: state.combo, lives: state.lives, hits: state.hits });
  }, []);

  useEffect(() => {
    const onDown = (event) => {
      if (!runningRef.current || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if (key === "ArrowLeft" || key === "a" || key === "A") moveLane(-1);
      else if (key === "ArrowRight" || key === "d" || key === "D") moveLane(1);
      else if (event.code === "Space") fire();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("keydown", onDown, true);
    return () => document.removeEventListener("keydown", onDown, true);
  }, [fire, moveLane]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    let frame = 0;
    let disposed = false;

    const render = (now) => {
      if (disposed) return;
      frame = window.requestAnimationFrame(render);
      if (document.hidden) return;
      const state = stateRef.current;
      const chartNow = chartRef.current;
      const clockNow = clockRef.current;
      const delta = state.lastFrame ? Math.min((now - state.lastFrame) / 1000, 0.05) : 0;
      state.lastFrame = now;

      const width = sizeRef.current.w || canvas.clientWidth;
      const height = sizeRef.current.h || canvas.clientHeight;
      if (width < 8 || height < 8) return;

      const { pad, laneWidth } = laneLayout(width);
      const lockY = height * LOCK_RATIO;
      const time = clockNow?.getTime?.() || 0;
      const duration = chartNow?.duration || clockNow?.getDuration?.() || 0;
      const grace = Math.max(1.6, Number(chartNow?.offset) || 0);
      const approach = approachSeconds(chartNow?.bpm || 120, 4, reducedRef.current);
      const audio = audioFrame(analyzerRef.current, time, chartNow);
      const visible = notesInWindow(chartNow?.notes || [], time - HIT_WINDOW - 0.05, time + approach + 0.05);
      const orbR = Math.max(11, Math.min(laneWidth * 0.22, 22));

      if (runningRef.current && time >= grace) {
        let missed = 0;
        for (const note of chartNow?.notes || []) {
          const key = noteKey(note);
          if (state.judged.has(key) || note.t > time - HIT_WINDOW) continue;
          state.judged.add(key);
          missed += 1;
        }
        if (missed > 0) {
          state.misses += missed;
          state.combo = 0;
          state.lives = Math.max(0, state.lives - missed);
          state.popup = "MISS";
          state.popupAt = now;
          setHud({ points: state.points, combo: 0, lives: state.lives, hits: state.hits });
          if (state.lives === 0 || state.misses >= MISS_LIMIT) {
            finishRef.current(`${state.hits} pulses · ${state.best}x combo`);
          }
        }
        const lastNote = chartNow?.notes?.[chartNow.notes.length - 1];
        if (lastNote && time > lastNote.t + 0.9 && !state.finished) {
          state.finished = true;
          finishRef.current(`Cleared · ${state.best}x combo`);
        } else if (duration > 0 && time >= duration - 0.05 && !state.finished) {
          state.finished = true;
          finishRef.current("Track ended");
        }
      }

      for (const particle of state.particles) particle.life -= delta * 2.4;
      state.particles = state.particles.filter((particle) => particle.life > 0);

      context.clearRect(0, 0, width, height);
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "#04070d");
      sky.addColorStop(0.55, "#071018");
      sky.addColorStop(1, "#0a1a24");
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      for (let lane = 0; lane < LANES; lane += 1) {
        const x = pad + lane * laneWidth;
        const active = lane === state.lane;
        context.fillStyle = active
          ? `rgba(0,230,230,${0.06 + audio.bass * 0.08})`
          : lane % 2 === 0 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.045)";
        context.fillRect(x, 0, laneWidth, height);
        context.strokeStyle = "rgba(255,255,255,0.06)";
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      const ringGlow = reducedRef.current ? 0.4 : 0.35 + audio.bass * 0.65;
      context.fillStyle = `rgba(0,230,230,${0.08 + audio.bass * 0.1})`;
      context.fillRect(pad, lockY - 18, width - pad * 2, 36);
      context.shadowColor = "#00e6e6";
      context.shadowBlur = reducedRef.current ? 0 : 16 * ringGlow;
      context.strokeStyle = `rgba(0,230,230,${Math.min(1, ringGlow)})`;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(pad, lockY);
      context.lineTo(width - pad, lockY);
      context.stroke();
      context.shadowBlur = 0;

      for (const note of visible) {
        if (state.judged.has(noteKey(note)) && time >= note.t) continue;
        const y = lockY - ((note.t - time) / approach) * lockY;
        const x = laneCenter(width, note.lane);
        const accent = note.kind === "accent";
        const radius = orbR * (accent ? 1.25 : 1);
        const gradient = context.createRadialGradient(x, y, 2, x, y, radius * 1.8);
        gradient.addColorStop(0, "#fff");
        gradient.addColorStop(0.35, LANE_COLORS[note.lane]);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius * 1.6, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = LANE_COLORS[note.lane];
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        if (accent) {
          context.strokeStyle = "rgba(255,255,255,0.7)";
          context.lineWidth = 2;
          context.stroke();
        }
      }

      for (const particle of state.particles) {
        const x = laneCenter(width, particle.x);
        context.globalAlpha = particle.life;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(x, lockY, 22 * (1.2 - particle.life), 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }

      const shipX = laneCenter(width, state.lane);
      const shipY = height - Math.max(36, height * 0.09);
      if (now < state.beamUntil) {
        context.strokeStyle = "rgba(0,230,230,0.75)";
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(shipX, shipY - 18);
        context.lineTo(shipX, lockY);
        context.stroke();
      }

      context.fillStyle = "#00e6e6";
      context.beginPath();
      context.moveTo(shipX, shipY - 22);
      context.lineTo(shipX - 16, shipY + 14);
      context.lineTo(shipX, shipY + 6);
      context.lineTo(shipX + 16, shipY + 14);
      context.closePath();
      context.fill();
      context.fillStyle = "#ffb648";
      context.fillRect(shipX - 2, shipY - 8, 4, 10);

      context.font = "700 12px system-ui, sans-serif";
      context.fillStyle = "rgba(255,255,255,0.45)";
      context.textAlign = "center";
      context.fillText("FIRE", shipX, height - 10);

      if (state.popup && now - state.popupAt < 380) {
        context.globalAlpha = 1 - (now - state.popupAt) / 380;
        context.fillStyle = state.popup === "MISS" || state.popup === "EARLY" ? "#ff4ecd" : "#ffb648";
        context.font = "800 28px system-ui, sans-serif";
        context.fillText(state.popup, width / 2, lockY - 40);
        context.globalAlpha = 1;
      }
    };

    frame = window.requestAnimationFrame(render);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
    };
  }, [sizeRef]);

  const handlePointer = (event) => {
    const canvas = canvasRef.current;
    if (!canvas || !runningRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.touches?.[0]?.clientX ?? event.clientX) - rect.left;
    stateRef.current.lane = laneFromX(rect.width, x);
    fire();
  };

  return (
    <div className="relative h-full w-full min-h-0">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointer}
        className="block h-full w-full touch-none"
        aria-label="Wave Invaders game board"
      />
      <div className="pointer-events-none absolute left-3 top-3 text-xs font-semibold text-white">
        <p className="text-lg tabular-nums">{hud.points.toLocaleString()}</p>
        <p className="text-[11px] text-[#00e6e6]">{hud.combo > 1 ? `${hud.combo}x combo` : `${hud.hits} pulses`}</p>
      </div>
      <p className="pointer-events-none absolute right-3 top-3 text-[11px] font-semibold text-[#ff4ecd]">
        {"♥".repeat(hud.lives) || "—"}
      </p>
      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-[#9aa8b5]">
        Fire on the glow ring · {chart?.bpm || 120} BPM
      </p>
    </div>
  );
}
