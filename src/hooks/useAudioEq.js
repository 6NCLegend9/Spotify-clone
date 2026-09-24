"use client";

import { useCallback, useEffect, useRef } from "react";
import { EQ_BAND_FREQS, eqHeadroomGain, normalizationGain } from "@/utils/eqPresets";
import { resumeAudioContext } from "@/utils/nativeAudio.mjs";

export default function useAudioEq(audioRef, { bands, normalization, monoAudio }) {
  const graphRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;

    let graph = graphRef.current;
    if (!graph || graph.audio !== audio) {
      graph?.context.close?.().catch(() => {});
      const context = new AudioContextClass();
      let source;
      try {
        source = context.createMediaElementSource(audio);
      } catch (error) {
        context.close().catch(() => {});
        return undefined;
      }

      const filters = EQ_BAND_FREQS.map((frequency, index) => {
        const filter = context.createBiquadFilter();
        filter.type = index === 0 ? "lowshelf" : index === EQ_BAND_FREQS.length - 1 ? "highshelf" : "peaking";
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return filter;
      });

      const preamp = context.createGain();
      const compressor = context.createDynamicsCompressor();
      // Browser defaults (-24 dB threshold, soft knee, 12:1 ratio) behave like
      // heavy mastering compression. HayKasa only needs peak protection after
      // EQ, so keep normal musical dynamics intact and catch near-clipping peaks.
      compressor.threshold.value = -1;
      compressor.knee.value = 0;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.08;

      const splitter = context.createChannelSplitter(2);
      const merger = context.createChannelMerger(2);

      source.connect(filters[0]);
      filters.reduce((previous, next) => {
        previous.connect(next);
        return next;
      });
      // Positive EQ boosts reserve preamp headroom BEFORE the peak limiter, so
      // the limiter remains a safety net instead of becoming audible compression.
      filters[filters.length - 1].connect(preamp);
      preamp.connect(compressor);
      compressor.connect(splitter);
      splitter.connect(merger, 0, 0);
      splitter.connect(merger, 1, 1);
      merger.connect(context.destination);

      graph = {
        audio,
        context,
        filters,
        preamp,
        compressor,
        splitter,
        merger,
        mono: false,
      };
      graphRef.current = graph;
    }

    const resume = () => {
      if (!audio.paused) void resumeAudioContext(graph.context).catch(() => {});
    };
    audio.addEventListener("play", resume);
    resume();

    return () => {
      audio.removeEventListener("play", resume);
    };
  }, [audioRef]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    graph.filters.forEach((filter, index) => {
      filter.gain.value = Number(bands?.[index] || 0);
    });
    graph.preamp.gain.value = normalizationGain(normalization) * eqHeadroomGain(bands);

    if (monoAudio === graph.mono) return;

    graph.compressor.disconnect();
    graph.splitter.disconnect();
    graph.merger.disconnect();

    if (monoAudio) {
      graph.compressor.connect(graph.splitter);
      graph.splitter.connect(graph.merger, 0, 0);
      graph.splitter.connect(graph.merger, 0, 1);
      graph.merger.connect(graph.context.destination);
    } else {
      graph.compressor.connect(graph.context.destination);
    }

    graph.mono = Boolean(monoAudio);
  }, [bands, normalization, monoAudio]);

  useEffect(() => () => {
    graphRef.current?.context.close?.().catch(() => {});
    graphRef.current = null;
  }, []);

  return useCallback(() => resumeAudioContext(graphRef.current?.context), []);
}
