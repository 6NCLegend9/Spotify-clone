import { EQ_BAND_FREQS, eqHeadroomGain, normalizationGain } from "@/utils/eqPresets";

export function createNativeAudioGraph(media, settings = {}) {
  try {
    const session = globalThis.navigator?.audioSession;
    if (session) session.type = "playback";
  } catch { /* Optional audio-session support must not block playback. */ }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  let context, source;
  try {
    context = new AudioContext();
    source = context.createMediaElementSource(media);
  } catch { void context?.close().catch(() => {}); return null; }
  const filters = EQ_BAND_FREQS.map((frequency, index) => {
    const filter = context.createBiquadFilter();
    filter.type = index === 0 ? "lowshelf" : index === EQ_BAND_FREQS.length - 1 ? "highshelf" : "peaking";
    filter.frequency.value = frequency;
    filter.Q.value = 1;
    return filter;
  });
  const gain = context.createGain(), limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = .003; limiter.release.value = .08;
  source.connect(filters[0]);
  for (let i = 1; i < filters.length; i++) filters[i - 1].connect(filters[i]);
  filters.at(-1).connect(gain); gain.connect(limiter);
  const splitter = context.createChannelSplitter(2), mono = context.createGain(), merger = context.createChannelMerger(2);
  mono.gain.value = .5; mono.channelCount = 1; mono.channelCountMode = "explicit";
  const graph = {
    configure({ bands = [], normalization, monoAudio } = {}) {
      filters.forEach((filter, i) => { filter.gain.value = Math.min(12, Math.max(-12, Number(bands[i]) || 0)); });
      gain.gain.value = normalizationGain(normalization) * eqHeadroomGain(bands);
      limiter.disconnect(); splitter.disconnect(); mono.disconnect(); merger.disconnect();
      if (monoAudio) {
        limiter.connect(splitter); splitter.connect(mono, 0); splitter.connect(mono, 1);
        mono.connect(merger, 0, 0); mono.connect(merger, 0, 1); merger.connect(context.destination);
      } else limiter.connect(context.destination);
    },
    resume: () => context.state === "suspended" || context.state === "interrupted" ? context.resume() : Promise.resolve(),
    close: () => { source.disconnect(); void context.close().catch(() => {}); },
  };
  graph.configure(settings);
  return graph;
}
