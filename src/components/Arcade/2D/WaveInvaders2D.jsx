"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PLAYER_W_RATIO = 0.09;
const PLAYER_SPEED = 620;
const BULLET_SPEED = 720;
const ENEMY_BASE_SPEED = 90;
const ENEMY_SIZE_RATIO = 0.062;
const FIRE_COOLDOWN_MS = 180;
const SPAWN_COOLDOWN_MS = 260;
const MAX_ENEMIES = 18;
const START_LIVES = 3;

/**
 * Retro vertical shooter. Enemy waves spawn on mid/treble onsets, so the wave
 * pattern follows the track rather than a fixed timer.
 */
export default function WaveInvaders2D({ analyzer, running, reducedMotion, onGameOver }) {
  const canvasRef = useRef(null);
  const runningRef = useRef(running);
  const keysRef = useRef({ left: false, right: false });
  const pointerRef = useRef({ active: false, x: 0 });
  const fireRef = useRef({ requested: false, lastAt: 0 });
  const overRef = useRef(false);
  const gameOverRef = useRef(onGameOver);
  const stateRef = useRef({
    playerX: 0.5,
    bullets: [],
    enemies: [],
    lastSpawn: 0,
    lastFrame: 0,
    nextId: 1,
    shake: 0,
    points: 0,
    lives: START_LIVES,
    wave: 0,
  });
  const [score, setScore] = useState({ points: 0, lives: START_LIVES, wave: 0 });

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    gameOverRef.current = onGameOver;
  }, [onGameOver]);

  const fire = useCallback(() => {
    fireRef.current.requested = true;
  }, []);

  // Capture phase keeps arrows and Space away from the global player shortcuts.
  useEffect(() => {
    if (!running) return undefined;
    const setKey = (event, value) => {
      const key = event.key;
      if (key === "ArrowLeft" || key === "a" || key === "A") keysRef.current.left = value;
      else if (key === "ArrowRight" || key === "d" || key === "D") keysRef.current.right = value;
      else if (event.code === "Space") {
        if (value) fire();
      } else return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      setKey(event, true);
    };
    const onUp = (event) => setKey(event, false);
    document.addEventListener("keydown", onDown, true);
    document.addEventListener("keyup", onUp, true);
    return () => {
      document.removeEventListener("keydown", onDown, true);
      document.removeEventListener("keyup", onUp, true);
    };
  }, [fire, running]);

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

    const render = (now) => {
      if (disposed) return;
      frame = window.requestAnimationFrame(render);
      const state = stateRef.current;
      const delta = state.lastFrame ? Math.min((now - state.lastFrame) / 1000, 0.05) : 0;
      state.lastFrame = now;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const playerW = width * PLAYER_W_RATIO;
      const playerY = height - Math.max(28, height * 0.08);
      const enemySize = Math.max(18, width * ENEMY_SIZE_RATIO);
      const audio = analyzer.read(now);

      if (runningRef.current) {
        // Steering: keyboard, or drag position when a pointer is down.
        if (pointerRef.current.active) {
          state.playerX += (pointerRef.current.x - state.playerX) * Math.min(1, delta * 14);
        } else {
          const dir = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
          state.playerX += (dir * PLAYER_SPEED * delta) / Math.max(width, 1);
        }
        const half = playerW / 2 / width;
        state.playerX = Math.max(half, Math.min(1 - half, state.playerX));

        if (fireRef.current.requested && now - fireRef.current.lastAt >= FIRE_COOLDOWN_MS) {
          fireRef.current.lastAt = now;
          state.bullets.push({ id: (state.nextId += 1), x: state.playerX * width, y: playerY - 14 });
        }
        fireRef.current.requested = false;

        for (const bullet of state.bullets) bullet.y -= BULLET_SPEED * delta;
        state.bullets = state.bullets.filter((bullet) => bullet.y > -20);

        // Treble/mid spikes decide when a new attacker joins.
        if (audio.onset && now - state.lastSpawn >= SPAWN_COOLDOWN_MS && state.enemies.length < MAX_ENEMIES) {
          state.lastSpawn = now;
          const drift = (Math.random() - 0.5) * 0.5;
          state.enemies.push({
            id: (state.nextId += 1),
            x: 0.12 + Math.random() * 0.76,
            y: -enemySize,
            drift,
            hue: audio.treble > 0.35 ? "#ff4ecd" : "#7c5cff",
          });
          state.wave += 1;
          setScore({ points: state.points, lives: state.lives, wave: state.wave });
        }

        const fallSpeed = (reducedMotion ? ENEMY_BASE_SPEED * 0.7 : ENEMY_BASE_SPEED) * (1 + audio.energy * 1.6);
        let lost = 0;
        const survivors = [];
        for (const enemy of state.enemies) {
          enemy.y += fallSpeed * delta;
          enemy.x += enemy.drift * delta * 0.12;
          if (enemy.x < 0.08 || enemy.x > 0.92) enemy.drift *= -1;
          if (enemy.y > height) {
            lost += 1;
            continue;
          }
          survivors.push(enemy);
        }
        state.enemies = survivors;
        if (lost > 0) {
          state.shake = 1;
          state.lives = Math.max(0, state.lives - lost);
          setScore({ points: state.points, lives: state.lives, wave: state.wave });
          if (state.lives === 0 && !overRef.current) {
            overRef.current = true;
            runningRef.current = false;
            gameOverRef.current?.({ score: state.points, detail: `Wave ${state.wave}` });
          }
        }

        // Bullet / enemy collisions.
        const hitBullets = new Set();
        const hitEnemies = new Set();
        for (const bullet of state.bullets) {
          for (const enemy of state.enemies) {
            if (hitEnemies.has(enemy.id)) continue;
            if (
              Math.abs(bullet.x - enemy.x * width) < enemySize * 0.6
              && Math.abs(bullet.y - enemy.y) < enemySize * 0.6
            ) {
              hitBullets.add(bullet.id);
              hitEnemies.add(enemy.id);
              break;
            }
          }
        }
        if (hitEnemies.size > 0) {
          state.bullets = state.bullets.filter((bullet) => !hitBullets.has(bullet.id));
          state.enemies = state.enemies.filter((enemy) => !hitEnemies.has(enemy.id));
          state.points += hitEnemies.size * 120;
          setScore({ points: state.points, lives: state.lives, wave: state.wave });
        }
      }

      state.shake = Math.max(0, state.shake - delta * 3);
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#04070d";
      context.fillRect(0, 0, width, height);

      context.save();
      if (state.shake > 0 && !reducedMotion) {
        context.translate((Math.random() - 0.5) * 6 * state.shake, (Math.random() - 0.5) * 6 * state.shake);
      }

      // Starfield rows pulse with the bass.
      const rows = 6;
      for (let row = 0; row < rows; row += 1) {
        const y = ((now / 18 + row * (height / rows)) % height);
        context.fillStyle = `rgba(0,230,230,${0.05 + audio.bass * 0.08})`;
        context.fillRect(0, y, width, 1);
      }

      for (const enemy of state.enemies) {
        const x = enemy.x * width;
        context.fillStyle = enemy.hue;
        context.beginPath();
        context.moveTo(x, enemy.y + enemySize * 0.5);
        context.lineTo(x - enemySize * 0.5, enemy.y - enemySize * 0.35);
        context.lineTo(x + enemySize * 0.5, enemy.y - enemySize * 0.35);
        context.closePath();
        context.fill();
      }

      context.fillStyle = "#ffb648";
      for (const bullet of state.bullets) context.fillRect(bullet.x - 2, bullet.y - 12, 4, 12);

      const px = state.playerX * width;
      context.fillStyle = "#00e6e6";
      context.beginPath();
      context.moveTo(px, playerY - playerW * 0.45);
      context.lineTo(px - playerW * 0.5, playerY + playerW * 0.3);
      context.lineTo(px + playerW * 0.5, playerY + playerW * 0.3);
      context.closePath();
      context.fill();
      context.restore();
    };

    frame = window.requestAnimationFrame(render);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [analyzer, reducedMotion]);

  const pointerPosition = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return ((event.touches?.[0]?.clientX ?? event.clientX) - rect.left) / rect.width;
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={(event) => {
          pointerRef.current = { active: true, x: pointerPosition(event) };
          fire();
        }}
        onPointerMove={(event) => {
          if (pointerRef.current.active) pointerRef.current.x = pointerPosition(event);
        }}
        onPointerUp={() => { pointerRef.current.active = false; }}
        onPointerLeave={() => { pointerRef.current.active = false; }}
        className="h-full w-full touch-none"
        aria-label="Wave Invaders game board"
      />
      <div className="pointer-events-none absolute left-3 top-3 text-xs font-semibold text-white">
        <p className="tabular-nums">{score.points.toLocaleString()}</p>
        <p className="text-[11px] text-[#ffb648]">Wave {score.wave}</p>
      </div>
      <p className="pointer-events-none absolute right-3 top-3 text-[11px] font-semibold text-white">
        <span className="text-[#ff4ecd]">{"♥".repeat(score.lives) || "—"}</span>
      </p>
    </div>
  );
}
