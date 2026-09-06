"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LANES = 4;
const LANE_KEYS = ["d", "f", "j", "k"];
const LANE_COLORS = ["#00e6e6", "#7c5cff", "#ff4ecd", "#ffb648"];
const JUDGMENT_RATIO = 0.82;
const TILE_HEIGHT_RATIO = 0.14;
const BASE_FALL_PX_PER_SEC = 520;
const REDUCED_FALL_PX_PER_SEC = 320;
const HIT_WINDOW_PX = 46;
const PERFECT_WINDOW_PX = 18;
const MIN_SPAWN_GAP_MS = 190;
// No collisions in this mode, so a miss budget is what ends a round.
const MISS_LIMIT = 12;

/**
 * 4-lane rhythm engine. Tiles spawn on audio onsets and are judged as they
 * cross the line near the bottom.
 *
 * The whole simulation lives in refs and runs off one rAF loop; only the
 * scoreboard is React state, so gameplay never triggers a re-render.
 */
export default function MagicTiles2D({ analyzer, running, reducedMotion, onScore, onGameOver }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ tiles: [], nextId: 1, lastSpawn: 0, lastFrame: 0, flash: [0, 0, 0, 0], misses: 0 });
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

  const judgeLane = useCallback((lane) => {
    if (!runningRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const height = canvas.clientHeight;
    const judgmentY = height * JUDGMENT_RATIO;
    const state = stateRef.current;

    let bestIndex = -1;
    let bestDistance = Infinity;
    state.tiles.forEach((tile, index) => {
      if (tile.lane !== lane || tile.judged) return;
      const distance = Math.abs(tile.y - judgmentY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    state.flash[lane] = 1;
    if (bestIndex === -1 || bestDistance > HIT_WINDOW_PX) {
      setScore((current) => ({ ...current, combo: 0 }));
      return;
    }

    state.tiles[bestIndex].judged = true;
    state.tiles[bestIndex].hit = true;
    const perfect = bestDistance <= PERFECT_WINDOW_PX;
    setScore((current) => {
      const combo = current.combo + 1;
      const gained = (perfect ? 100 : 50) + Math.min(combo, 20) * 5;
      const next = {
        points: current.points + gained,
        combo,
        best: Math.max(current.best, combo),
        hits: current.hits + 1,
        misses: current.misses,
      };
      onScore?.(next);
      return next;
    });
  }, [onScore]);

  // Capture phase keeps game keys away from the global player shortcuts.
  useEffect(() => {
    if (!running) return undefined;
    const onKeyDown = (event) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const lane = LANE_KEYS.indexOf(event.key.toLowerCase());
      if (lane === -1) return;
      event.preventDefault();
      event.stopPropagation();
      judgeLane(lane);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [judgeLane, running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    let frame = 0;
    let disposed = false;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const fallSpeed = reducedMotion ? REDUCED_FALL_PX_PER_SEC : BASE_FALL_PX_PER_SEC;

    const render = (now) => {
      if (disposed) return;
      frame = window.requestAnimationFrame(render);
      const state = stateRef.current;
      const delta = state.lastFrame ? Math.min((now - state.lastFrame) / 1000, 0.05) : 0;
      state.lastFrame = now;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const laneWidth = width / LANES;
      const judgmentY = height * JUDGMENT_RATIO;
      const tileHeight = height * TILE_HEIGHT_RATIO;
      const audio = analyzer.read(now);

      if (runningRef.current) {
        if (audio.onset && now - state.lastSpawn >= MIN_SPAWN_GAP_MS) {
          state.lastSpawn = now;
          state.tiles.push({
            id: state.nextId += 1,
            lane: Math.floor(Math.random() * LANES),
            y: -tileHeight,
            judged: false,
            hit: false,
          });
        }
        for (const tile of state.tiles) tile.y += fallSpeed * delta;
        const survivors = [];
        let missed = 0;
        for (const tile of state.tiles) {
          if (!tile.judged && tile.y - tileHeight > judgmentY + HIT_WINDOW_PX) {
            missed += 1;
            continue;
          }
          if (tile.y > height + tileHeight) continue;
          survivors.push(tile);
        }
        state.tiles = survivors;
        if (missed > 0) {
          state.misses += missed;
          setScore((current) => ({ ...current, combo: 0, misses: current.misses + missed }));
          if (state.misses >= MISS_LIMIT && !overRef.current) {
            overRef.current = true;
            runningRef.current = false;
            const final = scoreRef.current;
            gameOverRef.current?.({
              score: final.points,
              detail: `${final.hits} hits · best combo ${final.best}`,
            });
          }
        }
      }

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#04070d";
      context.fillRect(0, 0, width, height);

      // Lane guides, lit by the current bass level.
      for (let lane = 0; lane < LANES; lane += 1) {
        const x = lane * laneWidth;
        context.fillStyle = lane % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)";
        context.fillRect(x, 0, laneWidth, height);
        state.flash[lane] = Math.max(0, state.flash[lane] - delta * 3.5);
        if (state.flash[lane] > 0) {
          context.fillStyle = `rgba(0,230,230,${state.flash[lane] * 0.18})`;
          context.fillRect(x, 0, laneWidth, height);
        }
        context.strokeStyle = "rgba(255,255,255,0.07)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      for (const tile of state.tiles) {
        if (tile.hit) continue;
        const x = tile.lane * laneWidth + laneWidth * 0.08;
        const w = laneWidth * 0.84;
        const y = tile.y - tileHeight;
        context.fillStyle = LANE_COLORS[tile.lane];
        context.globalAlpha = 0.9;
        context.fillRect(x, y, w, tileHeight);
        context.globalAlpha = 1;
      }

      const glow = reducedMotion ? 0.4 : 0.4 + audio.bass * 0.6;
      context.strokeStyle = `rgba(0,230,230,${Math.min(1, glow)})`;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, judgmentY);
      context.lineTo(width, judgmentY);
      context.stroke();

      context.font = "600 11px system-ui, sans-serif";
      context.fillStyle = "rgba(255,255,255,0.45)";
      context.textAlign = "center";
      for (let lane = 0; lane < LANES; lane += 1) {
        context.fillText(LANE_KEYS[lane].toUpperCase(), lane * laneWidth + laneWidth / 2, height - 10);
      }
    };

    frame = window.requestAnimationFrame(render);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [analyzer, reducedMotion]);

  const handlePointer = (event) => {
    const canvas = canvasRef.current;
    if (!canvas || !running) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.touches?.[0]?.clientX ?? event.clientX) - rect.left;
    judgeLane(Math.max(0, Math.min(LANES - 1, Math.floor((x / rect.width) * LANES))));
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointer}
        className="h-full w-full touch-none rounded-lg"
        aria-label="Magic Tiles game board"
      />
      <div className="pointer-events-none absolute left-3 top-3 text-xs font-semibold text-white">
        <p className="tabular-nums">{score.points.toLocaleString()}</p>
        <p className="text-[11px] text-[#00e6e6]">
          {score.combo > 1 ? `${score.combo}x combo` : `${score.hits} hits`}
        </p>
      </div>
      <p className="pointer-events-none absolute right-3 top-3 text-[11px] tabular-nums text-[#9aa8b5]">
        {analyzer.mode === "fft" ? "Live audio" : "Steady tempo"}
      </p>
    </div>
  );
}
