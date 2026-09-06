"use client";

import { useEffect, useRef, useState } from "react";

const LANES = [-1.7, 0, 1.7];
const BASE_SPEED = 14;
const SPAWN_COOLDOWN_MS = 420;
const OBSTACLE_START_Z = -70;
const DESPAWN_Z = 9;
const LANE_LERP = 12;

/**
 * 3-lane runner on a neon grid. Speed and obstacle density follow the track's
 * energy, so a busier section of the song genuinely gets harder.
 *
 * Three.js is imported on demand and every geometry/material is shared and
 * disposed on teardown - the renderer never frees GPU memory on its own.
 */
export default function BeatRunner3D({ analyzer, running, reducedMotion, onGameOver }) {
  const mountRef = useRef(null);
  const runningRef = useRef(running);
  const laneRef = useRef(1);
  const swipeRef = useRef({ x: 0, active: false });
  const overRef = useRef(false);
  const gameOverRef = useRef(onGameOver);
  const [score, setScore] = useState({ distance: 0, hits: 0 });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    gameOverRef.current = onGameOver;
  }, [onGameOver]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const moveLane = (direction) => {
    laneRef.current = Math.max(0, Math.min(LANES.length - 1, laneRef.current + direction));
  };

  useEffect(() => {
    if (!running) return undefined;
    const onKeyDown = (event) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      let direction = 0;
      if (key === "ArrowLeft" || key === "a" || key === "A") direction = -1;
      else if (key === "ArrowRight" || key === "d" || key === "D") direction = 1;
      else return;
      event.preventDefault();
      event.stopPropagation();
      moveLane(direction);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [running]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let disposed = false;
    let frame = 0;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#04070d");
      scene.fog = new THREE.Fog("#04070d", 18, 62);

      const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 120);
      camera.position.set(0, 2.6, 6.4);
      camera.lookAt(0, 0.7, -6);

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
      } catch {
        return; // No WebGL: the caller still shows the HUD and score.
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.setAttribute("aria-label", "Beat Runner game board");

      // Shared resources: created once, disposed once.
      const grid = new THREE.GridHelper(80, 80, "#00e6e6", "#123");
      grid.position.y = 0;
      scene.add(grid);

      const playerGeometry = new THREE.CapsuleGeometry(0.42, 0.7, 4, 12);
      const playerMaterial = new THREE.MeshBasicMaterial({ color: "#00e6e6" });
      const player = new THREE.Mesh(playerGeometry, playerMaterial);
      player.position.set(LANES[1], 0.85, 3.2);
      scene.add(player);

      const obstacleGeometry = new THREE.BoxGeometry(1.15, 1.15, 1.15);
      const obstacleMaterial = new THREE.MeshBasicMaterial({ color: "#ff4ecd" });
      const bonusMaterial = new THREE.MeshBasicMaterial({ color: "#ffb648" });

      const obstacles = [];
      const spawn = (lane, bonus) => {
        const mesh = new THREE.Mesh(obstacleGeometry, bonus ? bonusMaterial : obstacleMaterial);
        mesh.position.set(LANES[lane], 0.75, OBSTACLE_START_Z);
        mesh.userData = { lane, bonus, scored: false };
        scene.add(mesh);
        obstacles.push(mesh);
      };

      const resize = () => {
        const { clientWidth, clientHeight } = mount;
        if (!clientWidth || !clientHeight) return;
        renderer.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      let lastFrame = 0;
      let lastSpawn = 0;
      let travelled = 0;

      const render = (now) => {
        if (disposed) return;
        frame = window.requestAnimationFrame(render);
        const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
        lastFrame = now;
        const audio = analyzer.read(now);

        const speed = (reducedMotion ? BASE_SPEED * 0.65 : BASE_SPEED) * (1 + audio.energy * 1.1);

        if (runningRef.current) {
          travelled += speed * delta;
          if (Math.floor(travelled) % 5 === 0) setScore((s) => ({ ...s, distance: Math.floor(travelled) }));

          if (audio.onset && now - lastSpawn >= SPAWN_COOLDOWN_MS) {
            lastSpawn = now;
            const lane = Math.floor(Math.random() * LANES.length);
            // Bright tracks make bonuses a little likelier, but hazards must stay
            // the norm or a treble-heavy song would never spawn anything harmful.
            const bonusChance = audio.treble > 0.42 ? 0.24 : 0.12;
            spawn(lane, Math.random() < bonusChance);
          }

          for (let index = obstacles.length - 1; index >= 0; index -= 1) {
            const mesh = obstacles[index];
            mesh.position.z += speed * delta;
            mesh.rotation.x += delta * 1.2;

            if (!mesh.userData.scored && Math.abs(mesh.position.z - player.position.z) < 0.9) {
              mesh.userData.scored = true;
              if (mesh.userData.lane === laneRef.current) {
                if (mesh.userData.bonus) {
                  travelled += 50;
                  setScore((s) => ({ ...s, distance: Math.floor(travelled) }));
                } else if (!overRef.current) {
                  // One clean hit ends the run, as the genre expects.
                  overRef.current = true;
                  runningRef.current = false;
                  setScore((s) => ({ ...s, hits: s.hits + 1 }));
                  setFailed(true);
                  gameOverRef.current?.({
                    score: Math.floor(travelled),
                    unit: "m",
                    detail: "Clipped an obstacle",
                  });
                }
              }
            }

            if (mesh.position.z > DESPAWN_Z) {
              scene.remove(mesh);
              obstacles.splice(index, 1);
            }
          }
        }

        // Lane easing + a bass-driven hop keep the avatar readable at speed.
        const targetX = LANES[laneRef.current];
        player.position.x += (targetX - player.position.x) * Math.min(1, delta * LANE_LERP);
        player.position.y = 0.85 + (reducedMotion ? 0 : audio.bass * 0.4);

        grid.position.z = (now / 1000 * speed) % 2;
        const glow = 0.35 + audio.bass * 0.65;
        grid.material.opacity = Math.min(1, glow);
        grid.material.transparent = true;

        renderer.render(scene, camera);
      };

      frame = window.requestAnimationFrame(render);

      cleanup = () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener("resize", resize);
        for (const mesh of obstacles) scene.remove(mesh);
        obstacles.length = 0;
        // Three.js keeps GPU resources until they are explicitly released.
        playerGeometry.dispose();
        playerMaterial.dispose();
        obstacleGeometry.dispose();
        obstacleMaterial.dispose();
        bonusMaterial.dispose();
        grid.geometry.dispose();
        grid.material.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [analyzer, reducedMotion]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={mountRef}
        className="h-full w-full touch-none"
        onPointerDown={(event) => { swipeRef.current = { x: event.clientX, active: true }; }}
        onPointerUp={(event) => {
          if (!swipeRef.current.active) return;
          const delta = event.clientX - swipeRef.current.x;
          swipeRef.current.active = false;
          if (Math.abs(delta) > 28) moveLane(delta > 0 ? 1 : -1);
        }}
      />
      <div className="pointer-events-none absolute left-3 top-3 text-xs font-semibold text-white">
        <p className="tabular-nums">{score.distance.toLocaleString()} m</p>
        <p className="text-[11px] text-[#ff4ecd]">{score.hits} hits</p>
      </div>
      {failed ? (
        <div className="pointer-events-none absolute inset-0 bg-[#ff4ecd]/15" aria-hidden="true" />
      ) : null}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-[#9aa8b5]">
        Dodge pink · grab gold
      </div>
    </div>
  );
}
