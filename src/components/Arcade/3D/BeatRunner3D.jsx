"use client";

import { useEffect, useRef, useState } from "react";
import { approachSeconds, beatInterval, chartEnergy, notesInWindow, remapLanes } from "@/utils/arcadeChart.mjs";

const LANE_X = [-2.15, 0, 2.15];
const PLAYER_Z = 3.4;
const START_Z = -62;
const LANE_LERP = 14;
const HIT_WINDOW = 0.14;
const START_LIVES = 3;

function audioFrame(analyzer, time, chart) {
  if (analyzer?.mode === "fft") return analyzer.read(performance.now());
  return chartEnergy(time, chart?.bpm || 120, chart?.offset || 0);
}

function roleForNote(note, bpm) {
  if (note.kind === "accent") return "ring";
  const beat = Math.round(note.t / beatInterval(bpm));
  if (beat % 8 === 5 || beat % 8 === 6) return "barrier";
  return "orb";
}

/**
 * Music highway. Notes become orbs, gold rings, or barriers and reach the
 * player on the beat. Stay in the lane to catch pulses; step aside for gates.
 */
export default function BeatRunner3D({ analyzer, clock, chart, running, reducedMotion, onGameOver }) {
  const mountRef = useRef(null);
  const clockRef = useRef(clock);
  const analyzerRef = useRef(analyzer);
  const chartRef = useRef(chart);
  const reducedRef = useRef(reducedMotion);
  clockRef.current = clock;
  analyzerRef.current = analyzer;
  chartRef.current = chart;
  reducedRef.current = reducedMotion;
  const runningRef = useRef(running);
  const laneRef = useRef(1);
  const swipeRef = useRef({ x: 0, active: false });
  const overRef = useRef(false);
  const gameOverRef = useRef(onGameOver);
  const [hud, setHud] = useState({ points: 0, combo: 0, lives: START_LIVES, caught: 0 });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    gameOverRef.current = onGameOver;
  }, [onGameOver]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const moveLane = (direction) => {
    laneRef.current = Math.max(0, Math.min(LANE_X.length - 1, laneRef.current + direction));
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
    const mapped = remapLanes(chart || { notes: [] }, 3);
    const bpm = mapped.bpm || 120;
    const notes = mapped.notes.map((note) => ({ ...note, role: roleForNote(note, bpm) }));

    (async () => {
      const THREE = await import("three");
      if (disposed) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#04070d");
      scene.fog = new THREE.Fog("#04070d", 14, 54);

      const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 120);
      camera.position.set(0, 3.15, 7.1);
      camera.lookAt(0, 0.35, -10);

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
      } catch {
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      if (disposed) {
        renderer.dispose();
        return;
      }
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.setAttribute("aria-label", "Beat Runner game board");

      const disposables = [];
      const track = new THREE.Mesh(
        new THREE.BoxGeometry(8.4, 0.08, 90),
        new THREE.MeshBasicMaterial({ color: "#07131c" }),
      );
      track.position.set(0, -0.08, -20);
      scene.add(track);
      disposables.push(track.geometry, track.material);

      const laneMats = [];
      LANE_X.forEach((x, index) => {
        const mat = new THREE.MeshBasicMaterial({
          color: index === 1 ? "#0a2a30" : "#0b1822",
          transparent: true,
          opacity: 0.95,
        });
        const lane = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.05, 90), mat);
        lane.position.set(x, 0.02, -20);
        scene.add(lane);
        laneMats.push(mat);
        disposables.push(lane.geometry, mat);
      });

      const railGeo = new THREE.BoxGeometry(0.14, 0.42, 90);
      const railMat = new THREE.MeshBasicMaterial({ color: "#00e6e6" });
      [-3.55, 3.55].forEach((x) => {
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(x, 0.22, -20);
        scene.add(rail);
      });
      disposables.push(railGeo, railMat);

      const beatGeo = new THREE.BoxGeometry(7.6, 0.03, 0.08);
      const beatMat = new THREE.MeshBasicMaterial({ color: "#00e6e6", transparent: true, opacity: 0.28 });
      const beatBars = Array.from({ length: 10 }, (_, index) => {
        const bar = new THREE.Mesh(beatGeo, beatMat);
        bar.position.set(0, 0.06, -index * 6);
        scene.add(bar);
        return bar;
      });
      disposables.push(beatGeo, beatMat);

      const shipMat = new THREE.MeshBasicMaterial({ color: "#00e6e6" });
      const canopyMat = new THREE.MeshBasicMaterial({ color: "#ffb648" });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.2, 1.25), shipMat);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 0.42), shipMat);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 8), canopyMat);
      nose.rotation.x = Math.PI / 2;
      const player = new THREE.Group();
      body.position.y = 0.12;
      wing.position.set(0, 0.04, 0.1);
      nose.position.set(0, 0.12, -0.72);
      player.add(body, wing, nose);
      player.position.set(LANE_X[1], 0.55, PLAYER_Z);
      scene.add(player);
      disposables.push(body.geometry, wing.geometry, nose.geometry, shipMat, canopyMat);

      const orbGeo = new THREE.SphereGeometry(0.42, 10, 8);
      const ringGeo = new THREE.TorusGeometry(0.72, 0.1, 8, 18);
      const barrierGeo = new THREE.BoxGeometry(1.7, 1.35, 0.28);
      const orbMat = new THREE.MeshBasicMaterial({ color: "#00e6e6" });
      const ringMat = new THREE.MeshBasicMaterial({ color: "#ffb648" });
      const barrierMat = new THREE.MeshBasicMaterial({ color: "#ff4ecd" });
      disposables.push(orbGeo, ringGeo, barrierGeo, orbMat, ringMat, barrierMat);

      const meshes = new Map();
      const resolved = new Set();
      let points = 0;
      let combo = 0;
      let best = 0;
      let caught = 0;
      let lives = START_LIVES;
      let invulnUntil = 0;
      let lastHud = 0;

      const resize = () => {
        const { clientWidth, clientHeight } = mount;
        if (!clientWidth || !clientHeight) return;
        renderer.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(mount);
      window.addEventListener("resize", resize);

      const finish = (detail) => {
        if (overRef.current) return;
        overRef.current = true;
        runningRef.current = false;
        setFailed(true);
        gameOverRef.current?.({
          score: points,
          detail: detail || `${caught} beats · ${best}x combo`,
        });
      };

      const render = (now) => {
        if (disposed) return;
        frame = window.requestAnimationFrame(render);
        if (!mount.clientWidth || !mount.clientHeight) return;
        const chartNow = chartRef.current;
        const clockNow = clockRef.current;
        const time = clockNow?.getTime?.() || 0;
        const duration = chartNow?.duration || clockNow?.getDuration?.() || 0;
        const grace = Math.max(1.6, Number(chartNow?.offset) || 0);
        const approach = approachSeconds(chartNow?.bpm || bpm, 5, reducedRef.current);
        const audio = audioFrame(analyzerRef.current, time, chartNow);
        const travel = PLAYER_Z - START_Z;
        const visible = notesInWindow(notes, time - 0.22, time + approach);

        const live = new Set();
        for (const note of visible) {
          const key = `${note.t}:${note.lane}`;
          live.add(key);
          let mesh = meshes.get(key);
          if (!mesh) {
            if (note.role === "ring") mesh = new THREE.Mesh(ringGeo, ringMat);
            else if (note.role === "barrier") mesh = new THREE.Mesh(barrierGeo, barrierMat);
            else mesh = new THREE.Mesh(orbGeo, orbMat);
            mesh.userData = note;
            scene.add(mesh);
            meshes.set(key, mesh);
          }
          mesh.position.x = LANE_X[note.lane];
          mesh.position.y = note.role === "barrier" ? 0.75 : 0.7;
          mesh.position.z = PLAYER_Z - ((note.t - time) / approach) * travel;
          if (note.role === "ring") mesh.rotation.y += 0.04;
          else if (note.role === "orb") mesh.rotation.y += 0.03;
        }
        for (const [key, mesh] of meshes) {
          if (!live.has(key)) {
            scene.remove(mesh);
            meshes.delete(key);
          }
        }

        if (runningRef.current) {
          if (now - lastHud > 140) {
            lastHud = now;
            setHud({ points, combo, lives, caught });
          }

          for (const note of notes) {
            const key = `${note.t}:${note.lane}`;
            if (time < grace || resolved.has(key) || note.t > time + HIT_WINDOW) continue;
            if (time - note.t > HIT_WINDOW) {
              resolved.add(key);
              if (note.role !== "barrier") {
                combo = 0;
                setHud({ points, combo, lives, caught });
              }
              continue;
            }
            if (Math.abs(note.t - time) > HIT_WINDOW) continue;
            resolved.add(key);
            const same = note.lane === laneRef.current;
            if (note.role === "barrier") {
              if (!same || now < invulnUntil) continue;
              lives -= 1;
              combo = 0;
              invulnUntil = now + 1100;
              setHud({ points, combo, lives, caught });
              if (lives <= 0) finish("Hit a barrier");
              continue;
            }
            if (!same) {
              combo = 0;
              setHud({ points, combo, lives, caught });
              continue;
            }
            combo += 1;
            best = Math.max(best, combo);
            caught += 1;
            points += (note.role === "ring" ? 220 : 110) + Math.min(combo, 28) * 8;
            setHud({ points, combo, lives, caught });
          }

          const lastNote = notes[notes.length - 1];
          if (lastNote && time > lastNote.t + 1) finish(`Finished · ${best}x combo`);
          else if (duration > 0 && time >= duration - 0.05) finish("Track ended");
        }

        const targetX = LANE_X[laneRef.current];
        player.position.x += (targetX - player.position.x) * Math.min(1, 0.18 * LANE_LERP);
        const pulse = reducedRef.current ? 0 : audio.bass;
        player.position.y = 0.55 + pulse * 0.22;
        player.scale.setScalar(now < invulnUntil && Math.floor(now / 80) % 2 === 0 ? 0.72 : 1 + pulse * 0.08);
        shipMat.color.set(now < invulnUntil ? "#ff4ecd" : "#00e6e6");
        laneMats.forEach((mat, index) => {
          mat.opacity = index === laneRef.current ? 0.95 : 0.55;
        });
        beatMat.opacity = 0.16 + pulse * 0.45;
        const interval = beatInterval(chartNow?.bpm || bpm);
        beatBars.forEach((bar, index) => {
          const cycle = 10 * 6;
          const offset = ((time / interval) * 2.2 + index * 6) % cycle;
          bar.position.z = PLAYER_Z - offset * 1.15;
        });
        renderer.render(scene, camera);
      };

      frame = window.requestAnimationFrame(render);

      cleanup = () => {
        window.cancelAnimationFrame(frame);
        observer.disconnect();
        window.removeEventListener("resize", resize);
        for (const mesh of meshes.values()) scene.remove(mesh);
        meshes.clear();
        for (const item of disposables) item.dispose?.();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [chart]);

  return (
    <div className="relative h-full w-full min-h-0">
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
        <p className="text-lg tabular-nums">{hud.points.toLocaleString()}</p>
        <p className="text-[11px] text-[#00e6e6]">{hud.combo > 1 ? `${hud.combo}x combo` : `${hud.caught} beats caught`}</p>
      </div>
      <p className="pointer-events-none absolute right-3 top-3 text-[11px] font-semibold text-[#ff4ecd]">
        {"♥".repeat(hud.lives) || "—"}
      </p>
      {failed ? (
        <div className="pointer-events-none absolute inset-0 bg-[#ff4ecd]/15" aria-hidden="true" />
      ) : null}
      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-[#9aa8b5]">
        Catch teal & gold · dodge pink gates · {chart?.bpm || 120} BPM
      </p>
    </div>
  );
}
