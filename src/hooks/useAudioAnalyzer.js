"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FFT_SIZE = 1024;
const SMOOTHING = 0.75;

// Band edges from the arcade spec.
const SUB_BASS_MAX_HZ = 150;
const MID_MIN_HZ = 500;
const TREBLE_MAX_HZ = 4000;

const ONSET_COOLDOWN_MS = 140;
const ONSET_SENSITIVITY = 1.35;
const HISTORY_SIZE = 43;

// Procedural fallback tempo, used when no analysable source is available.
const FALLBACK_BPM = 120;

function bandAverage(bins, sampleRate, fftSize, fromHz, toHz) {
  const hzPerBin = sampleRate / fftSize;
  const start = Math.max(0, Math.floor(fromHz / hzPerBin));
  const end = Math.min(bins.length - 1, Math.ceil(toHz / hzPerBin));
  if (end <= start) return 0;
  let total = 0;
  for (let index = start; index <= end; index += 1) total += bins[index];
  return total / (end - start + 1) / 255;
}

/**
 * Real-time frequency analysis for the Beat Arcade.
 *
 * Reads are pulled from the game's animation loop rather than pushed through
 * React state, so nothing here re-renders at frame rate.
 *
 * A YouTube IFrame exposes no audio samples to the page, so `attach` only works
 * for same-origin or CORS-enabled media (a local file, a blob, or a hosted
 * game track). Without one, the analyser reports `procedural` mode and drives
 * gameplay from a fixed tempo instead of pretending to hear anything.
 */
export default function useAudioAnalyzer() {
  const graphRef = useRef(null);
  const historyRef = useRef([]);
  const lastOnsetRef = useRef(0);
  const lastBeatRef = useRef(0);
  const [mode, setMode] = useState("procedural");

  const release = useCallback(() => {
    const graph = graphRef.current;
    graphRef.current = null;
    historyRef.current = [];
    if (!graph) return;
    try {
      graph.source.disconnect();
      graph.analyser.disconnect();
    } catch {
      // Nodes may already be torn down with their context.
    }
    graph.context.close?.().catch(() => {});
  }, []);

  const attach = useCallback((mediaElement) => {
    if (!mediaElement || graphRef.current?.media === mediaElement) return graphRef.current?.mode === "fft";
    release();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setMode("procedural");
      return false;
    }
    try {
      const context = new AudioContextClass();
      // Throws if this element already owns a MediaElementSourceNode.
      const source = context.createMediaElementSource(mediaElement);
      const analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = SMOOTHING;
      source.connect(analyser);
      analyser.connect(context.destination);
      graphRef.current = {
        media: mediaElement,
        context,
        source,
        analyser,
        bins: new Uint8Array(analyser.frequencyBinCount),
        mode: "fft",
      };
      setMode("fft");
      return true;
    } catch {
      setMode("procedural");
      return false;
    }
  }, [release]);

  const resume = useCallback(() => {
    const context = graphRef.current?.context;
    if (context?.state === "suspended") context.resume().catch(() => {});
  }, []);

  /** Pull one frame of band energy. Safe to call every animation frame. */
  const read = useCallback((now = performance.now()) => {
    const graph = graphRef.current;
    if (!graph) {
      // Procedural: a steady tempo grid so gameplay still works, clearly not "analysis".
      const beatMs = 60000 / FALLBACK_BPM;
      const phase = (now % beatMs) / beatMs;
      const pulse = Math.max(0, 1 - phase * 2.2);
      const onset = now - lastBeatRef.current >= beatMs;
      if (onset) lastBeatRef.current = now;
      return { bass: pulse * 0.7, mid: 0.35 + pulse * 0.2, treble: 0.3, energy: 0.45, onset, mode: "procedural" };
    }

    const { analyser, bins, context } = graph;
    analyser.getByteFrequencyData(bins);
    const { sampleRate } = context;
    const bass = bandAverage(bins, sampleRate, FFT_SIZE, 20, SUB_BASS_MAX_HZ);
    const mid = bandAverage(bins, sampleRate, FFT_SIZE, MID_MIN_HZ, 2000);
    const treble = bandAverage(bins, sampleRate, FFT_SIZE, 2000, TREBLE_MAX_HZ);

    // Spectral-flux style onset: compare mid/treble energy to its rolling mean.
    const energy = mid * 0.6 + treble * 0.4;
    const history = historyRef.current;
    history.push(energy);
    if (history.length > HISTORY_SIZE) history.shift();
    const mean = history.reduce((total, value) => total + value, 0) / history.length;
    const onset =
      history.length > 8
      && energy > mean * ONSET_SENSITIVITY
      && energy > 0.08
      && now - lastOnsetRef.current > ONSET_COOLDOWN_MS;
    if (onset) lastOnsetRef.current = now;

    return { bass, mid, treble, energy, onset, mode: "fft" };
  }, []);

  useEffect(() => release, [release]);

  return { attach, read, resume, release, mode };
}
