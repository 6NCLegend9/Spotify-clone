"use client";

import { useCallback, useEffect, useRef } from "react";
import { EQ_BAND_FREQS, normalizationGain } from "@/utils/eqPresets";
import { resumeAudioContext } from "@/utils/nativeAudio.mjs";

export default function useAudioEq(audioRef, { bands, normalization, monoAudio, spatialAudio }) {
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
      const compressor = context.createDynamicsCompressor();
      // Browser defaults (-24 dB threshold, soft knee, 12:1 ratio) behave like
      // heavy mastering compression. HayKasa only needs peak protection after
      // EQ, so keep normal musical dynamics intact and catch near-clipping peaks.
      compressor.threshold.value = -1;
      compressor.knee.value = 0;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.08;
      const gain = context.createGain();
      const splitter = context.createChannelSplitter(2);
      const merger = context.createChannelMerger(2);
      let panner = null;
      if (typeof context.createStereoPanner === "function") {
        try {
          panner = context.createStereoPanner();
          panner.pan.value = 0;
        } catch {
          panner = null;
        }
      }
      source.connect(filters[0]);
      filters.reduce((previous, next) => {
        previous.connect(next);
        return next;
      });
      filters[filters.length - 1].connect(compressor);
      compressor.connect(gain);
      gain.connect(splitter);
      splitter.connect(merger, 0, 0);
      splitter.connect(merger, 1, 1);
      if (panner) {
        merger.connect(panner);
        panner.connect(context.destination);
      } else {
        merger.connect(context.destination);
      }
      graph = { audio, context, filters, gain, splitter, merger, panner, mono: false };
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
    graph.gain.gain.value = normalizationGain(normalization);

    if (graph.panner) {
      graph.panner.pan.value = spatialAudio ? 0.05 : 0;
    }

    if (monoAudio === graph.mono) return;
    graph.gain.disconnect();
    graph.splitter.disconnect();
    graph.merger.disconnect();
    if (monoAudio) {
      graph.gain.connect(graph.splitter);
      graph.splitter.connect(graph.merger, 0, 0);
      graph.splitter.connect(graph.merger, 0, 1);
      if (graph.panner) {
        graph.merger.connect(graph.panner);
        graph.panner.connect(graph.context.destination);
      } else {
        graph.merger.connect(graph.context.destination);
      }
    } else if (graph.panner) {
      graph.gain.connect(graph.panner);
      graph.panner.connect(graph.context.destination);
    } else {
      graph.gain.connect(graph.context.destination);
    }
    graph.mono = Boolean(monoAudio);
  }, [bands, normalization, monoAudio, spatialAudio]);

  useEffect(() => () => {
    graphRef.current?.context.close?.().catch(() => {});
    graphRef.current = null;
  }, []);

  return useCallback(() => resumeAudioContext(graphRef.current?.context), []);
}
