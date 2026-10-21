"use client";

import { useCallback, useEffect, useRef } from "react";
import { createNativeAudioGraph } from "@/components/MusicPlayer/media/nativeAudioGraph.mjs";

export default function useAudioEq(audioRef, { bands, normalization, monoAudio }) {
  const graphRef = useRef(null);
  const lifetimeRef = useRef({ generation: 0 });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    if (graphRef.current?.audio !== audio) {
      graphRef.current?.graph?.close();
      graphRef.current = { audio, graph: createNativeAudioGraph(audio) };
    }
    const resume = () => {
      if (!audio.paused) void graphRef.current?.graph?.resume().catch(() => {});
    };
    audio.addEventListener("play", resume);
    resume();
    return () => audio.removeEventListener("play", resume);
  }, [audioRef]);

  useEffect(() => {
    graphRef.current?.graph?.configure({ bands, normalization, monoAudio });
  }, [bands, normalization, monoAudio]);

  useEffect(() => {
    const lifetime = lifetimeRef.current;
    const generation = ++lifetime.generation;
    return () => {
      // Strict Mode immediately reuses the mounted element. It cannot be bound
      // to another MediaElementSource after its first context has been closed.
      queueMicrotask(() => {
        if (lifetime.generation !== generation) return;
        graphRef.current?.graph?.close();
        graphRef.current = null;
      });
    };
  }, []);

  return useCallback(() => graphRef.current?.graph?.resume() || Promise.resolve(), []);
}
