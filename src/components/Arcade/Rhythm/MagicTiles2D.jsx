"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useArcadeCanvas from "@/hooks/useArcadeCanvas";
import { approachSeconds, chartEnergy, notesInWindow } from "@/utils/arcadeChart.mjs";

const LANES = 4;
const LANE_KEYS = ["d", "f", "j", "k"];
const LANE_COLORS = ["#00e6e6", "#7c5cff", "#ff4ecd", "#ffb648"];
const JUDGMENT_RATIO = 0.76;
const TILE_HEIGHT_RATIO = 0.12;
const PERFECT_WINDOW = 0.09;
const GOOD_WINDOW = 0.18;
const HIT_WINDOW = 0.28;
const MISS_LIMIT = 16;

function audioFrame(analyzer, time, chart) {
  if (analyzer?.mode === "fft") return analyzer.read(performance.now());
  return chartEnergy(time, chart?.bpm || 120, chart?.offset || 0);
}

function laneLayout(width) {
  const pad = Math.max(12, width * 0.045);
  const inner = Math.max(1, width - pad * 2);
  const laneWidth = inner / LANES;
  const gap = Math.min(16, Math.max(8, laneWidth * 0.12));
  return { pad, laneWidth, gap };
}

function laneBox(width, lane) {
  const { pad, laneWidth, gap } = laneLayout(width);
  return {
    x: pad + lane * laneWidth + gap / 2,
    w: Math.max(8, laneWidth - gap),
  };
}

function laneFromX(width, x) {
  const { pad, laneWidth } = laneLayout(width);
  return Math.max(0, Math.min(LANES - 1, Math.floor((x - pad) / laneWidth)));
}

function noteKey(note) {
  return `${note.t}:${note.lane}`;
}

/**
 * Piano-tiles engine: each chart note is drawn so its center crosses the glow
 * line at its song timestamp. Hits use a window wide enough to match that look.
 */
export default function MagicTiles2D({
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

  const stateRef = useRef({
    judged: new Set(),
    flash: [0, 0, 0, 0],
    popup: "",
    popupAt: 0,
    lastFrame: 0,
    misses: 0,
    finished: false,
  });
  const runningRef = useRef(running);
  const overRef = useRef(false);
  const gameOverRef = useRef(onGameOver);
  const [score, setScore] = useState({ points: 0, combo: 0, best: 0, hits: 0, misses: 0 });
  const scoreRef = useRef(score);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    gameOverRef.current = onGameOver;
  }, [onGameOver]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const finish = useCallback((detail) => {
    if (overRef.current) return;
    overRef.current = true;
    runningRef.current = false;
    const final = scoreRef.current;
    gameOverRef.current?.({
      score: final.points,
      detail: detail || `${final.hits} hits · best combo ${final.best}`,
    });
  }, []);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const judgeLane = useCallback((lane) => {
    if (!runningRef.current) return;
    const notes = chartRef.current?.notes;
    if (!notes) return;
    const time = clockRef.current.getTime();
    const state = stateRef.current;
    let best = null;
    let bestAbs = HIT_WINDOW;
    for (const note of notes) {
      if (note.lane !== lane || state.judged.has(noteKey(note))) continue;
      const delta = Math.abs(note.t - time);
      if (delta <= bestAbs) {
        best = note;
        bestAbs = delta;
      }
    }

    state.flash[lane] = 1;
    if (!best) return;

    state.judged.add(noteKey(best));
    const perfect = bestAbs <= PERFECT_WINDOW;
    const good = bestAbs <= GOOD_WINDOW;
    state.popup = perfect ? "PERFECT" : good ? "GOOD" : "OK";
    state.popupAt = performance.now();
    setScore((current) => {
      const combo = current.combo + 1;
      return {
        points: current.points + (perfect ? 120 : good ? 80 : 50) + Math.min(combo, 24) * 6,
        combo,
        best: Math.max(current.best, combo),
        hits: current.hits + 1,
        misses: current.misses,
      };
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!runningRef.current || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const lane = LANE_KEYS.indexOf(event.key.toLowerCase());
      if (lane === -1) return;
      event.preventDefault();
      event.stopPropagation();
      judgeLane(lane);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [judgeLane]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    let frame = 0;
    let disposed = false;

    const render = (now) => {
      if (disposed) return;
      frame = window.requestAnimationFrame(render);
      const state = stateRef.current;
      const chartNow = chartRef.current;
      const clockNow = clockRef.current;
      const delta = state.lastFrame ? Math.min((now - state.lastFrame) / 1000, 0.05) : 0;
      state.lastFrame = now;

      const width = sizeRef.current.w || canvas.clientWidth;
      const height = sizeRef.current.h || canvas.clientHeight;
      if (width < 8 || height < 8) return;

      const { pad, laneWidth } = laneLayout(width);
      const judgmentY = height * JUDGMENT_RATIO;
      const tileHeight = Math.max(28, height * TILE_HEIGHT_RATIO);
      const time = clockNow?.getTime?.() || 0;
      const duration = chartNow?.duration || clockNow?.getDuration?.() || 0;
      const approach = approachSeconds(chartNow?.bpm || 120, 4, reducedRef.current);
      const audio = audioFrame(analyzerRef.current, time, chartNow);
      const grace = Math.max(1.6, Number(chartNow?.offset) || 0);
      const visible = notesInWindow(chartNow?.notes || [], time - HIT_WINDOW - 0.08, time + approach + 0.05);

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
          state.popup = "MISS";
          state.popupAt = now;
          setScore((current) => ({
            ...current,
            combo: 0,
            misses: current.misses + missed,
          }));
          if (state.misses >= MISS_LIMIT) {
            finishRef.current(`${scoreRef.current.hits} hits · ${state.misses} misses`);
          }
        }
        const lastNote = chartNow?.notes?.[chartNow.notes.length - 1];
        if (lastNote && time > lastNote.t + 0.8 && !state.finished) {
          state.finished = true;
          finishRef.current("Cleared the chart");
        } else if (duration > 0 && time >= duration - 0.05 && !state.finished) {
          state.finished = true;
          finishRef.current("Track ended");
        }
      }

      context.clearRect(0, 0, width, height);
      const glow = context.createLinearGradient(0, 0, 0, height);
      glow.addColorStop(0, "#050910");
      glow.addColorStop(1, "#07131f");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (let lane = 0; lane < LANES; lane += 1) {
        const x = pad + lane * laneWidth;
        context.fillStyle = lane % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.055)";
        context.fillRect(x, 0, laneWidth, height);
        state.flash[lane] = Math.max(0, state.flash[lane] - delta * 3.6);
        if (state.flash[lane] > 0) {
          context.fillStyle = `rgba(0,230,230,${state.flash[lane] * 0.2})`;
          context.fillRect(x, 0, laneWidth, height);
        }
        context.strokeStyle = "rgba(255,255,255,0.07)";
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      for (const note of visible) {
        if (state.judged.has(noteKey(note)) && time >= note.t) continue;
        const centerY = judgmentY - ((note.t - time) / approach) * judgmentY;
        const top = centerY - tileHeight / 2;
        const box = laneBox(width, note.lane);
        context.fillStyle = LANE_COLORS[note.lane];
        context.globalAlpha = note.kind === "accent" ? 1 : 0.92;
        if (typeof context.roundRect === "function") {
          context.beginPath();
          context.roundRect(box.x, top, box.w, tileHeight, 10);
          context.fill();
        } else {
          context.fillRect(box.x, top, box.w, tileHeight);
        }
        context.globalAlpha = 1;
        if (note.kind === "accent") {
          context.strokeStyle = "rgba(255,255,255,0.55)";
          context.lineWidth = 2;
          context.strokeRect(box.x + 3, top + 3, box.w - 6, tileHeight - 6);
        }
      }

      const lineGlow = reducedRef.current ? 0.45 : 0.4 + audio.bass * 0.6;
      for (let lane = 0; lane < LANES; lane += 1) {
        const box = laneBox(width, lane);
        context.fillStyle = "rgba(0,230,230,0.16)";
        if (typeof context.roundRect === "function") {
          context.beginPath();
          context.roundRect(box.x, judgmentY - tileHeight * 0.28, box.w, tileHeight * 0.56, 8);
          context.fill();
        } else {
          context.fillRect(box.x, judgmentY - tileHeight * 0.28, box.w, tileHeight * 0.56);
        }
      }
      context.shadowColor = "#00e6e6";
      context.shadowBlur = reducedRef.current ? 0 : 12 * lineGlow;
      context.strokeStyle = `rgba(0,230,230,${Math.min(1, lineGlow)})`;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(pad, judgmentY);
      context.lineTo(width - pad, judgmentY);
      context.stroke();
      context.shadowBlur = 0;

      context.font = "700 13px system-ui, sans-serif";
      context.fillStyle = "rgba(255,255,255,0.62)";
      context.textAlign = "center";
      for (let lane = 0; lane < LANES; lane += 1) {
        const box = laneBox(width, lane);
        context.fillText(LANE_KEYS[lane].toUpperCase(), box.x + box.w / 2, Math.min(height - 16, judgmentY + 36));
      }

      if (state.popup && now - state.popupAt < 380) {
        context.globalAlpha = 1 - (now - state.popupAt) / 380;
        context.fillStyle = state.popup === "MISS" ? "#ff4ecd" : "#ffb648";
        context.font = "800 28px system-ui, sans-serif";
        context.fillText(state.popup, width / 2, judgmentY - 44);
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
    judgeLane(laneFromX(rect.width, x));
  };

  return (
    <div className="relative h-full w-full min-h-0">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointer}
        className="block h-full w-full touch-none"
        aria-label="Magic Tiles game board"
      />
      <div className="pointer-events-none absolute left-3 top-3 text-xs font-semibold text-white">
        <p className="text-lg tabular-nums">{score.points.toLocaleString()}</p>
        <p className="text-[11px] text-[#00e6e6]">
          {score.combo > 1 ? `${score.combo}x combo` : `${score.hits} hits`}
        </p>
      </div>
      <p className="pointer-events-none absolute right-3 top-3 text-[11px] tabular-nums text-[#9aa8b5]">
        {chart?.bpm || 120} BPM · {chart?.source === "onsets" ? "Live chart" : "Song chart"}
      </p>
    </div>
  );
}
