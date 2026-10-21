import { EQ_BAND_FREQS, eqHeadroomGain, normalizationGain } from "@/utils/eqPresets";
import { resumeAudioContext } from "@/utils/nativeAudio.mjs";

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
  filters.at(-1).connect(gain);
  const splitter = context.createChannelSplitter(2), mono = context.createGain(), merger = context.createChannelMerger(2);
  mono.gain.value = .5; mono.channelCount = 1; mono.channelCountMode = "explicit";
  const frequencies = Float32Array.from({ length: 512 }, (_, i) => 10 * ((context.sampleRate / 2) / 10) ** (i / 511));
  const magnitude = new Float32Array(frequencies.length), phase = new Float32Array(frequencies.length);
  const response = new Float64Array(frequencies.length);
  const eqHeadroom = (bands) => {
    if (!filters.some((filter) => filter.gain.value > 0)) return 1;
    response.fill(1);
    for (const filter of filters) {
      filter.getFrequencyResponse(frequencies, magnitude, phase);
      magnitude.forEach((value, i) => { response[i] *= value; });
    }
    // Cascaded bands overlap: the largest individual boost is insufficient.
    // Reserve another dB for filter transients and the optional Loud gain.
    const peak = Math.max(1, ...response.filter(Number.isFinite));
    return Math.min(eqHeadroomGain(bands), 10 ** (-1 / 20) / peak);
  };
  const graph = {
    configure({ bands = [], normalization, monoAudio } = {}) {
      filters.forEach((filter, i) => { filter.gain.value = Math.min(12, Math.max(-12, Number(bands[i]) || 0)); });
      gain.gain.value = normalizationGain(normalization) * eqHeadroom(bands);
      gain.disconnect(); limiter.disconnect(); splitter.disconnect(); mono.disconnect(); merger.disconnect();
      // Original/quiet playback keeps the source dynamics intact. Limit only
      // intentional amplification from EQ boosts or the Loud playback level.
      const amplified = filters.some((filter) => filter.gain.value > 0) || normalizationGain(normalization) > 1;
      const output = amplified ? limiter : gain;
      if (amplified) gain.connect(limiter);
      if (monoAudio) {
        output.connect(splitter); splitter.connect(mono, 0); splitter.connect(mono, 1);
        mono.connect(merger, 0, 0); mono.connect(merger, 0, 1); merger.connect(context.destination);
      } else output.connect(context.destination);
    },
    resume: () => resumeAudioContext(context),
    close: () => { source.disconnect(); void context.close().catch(() => {}); },
  };
  graph.configure(settings);
  return graph;
}
