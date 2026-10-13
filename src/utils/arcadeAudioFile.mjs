export const MAX_ARCADE_AUDIO_BYTES = 32 * 1024 * 1024;
export const MAX_ARCADE_AUDIO_SECONDS = 10 * 60;
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/wave", "audio/x-wav", "audio/ogg", "audio/webm", "audio/aac", "audio/flac", "audio/x-flac"]);

export function validateArcadeAudioFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error("Choose a nonempty audio file.");
  if (file.size > MAX_ARCADE_AUDIO_BYTES) throw new Error("Choose an audio file under 32 MB.");
  if (!AUDIO_TYPES.has(file.type)) throw new Error("Choose a supported MP3, M4A, WAV, Ogg, WebM, AAC, or FLAC file.");
}

export async function decodeArcadeAudio(file, { signal, AudioContextClass } = {}) {
  validateArcadeAudioFile(file);
  if (!AudioContextClass) throw new Error("This browser cannot analyze audio files.");
  const cancelled = () => {
    if (signal?.aborted) throw new DOMException("Audio import cancelled", "AbortError");
  };
  cancelled();
  const wait = (promise) => new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Audio import cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal?.removeEventListener("abort", abort));
    if (signal?.aborted) abort();
  });
  const context = new AudioContextClass();
  const close = () => { void context.close?.().catch(() => {}); };
  signal?.addEventListener("abort", close, { once: true });
  try {
    const buffer = await wait(file.arrayBuffer());
    cancelled();
    const decoded = await wait(context.decodeAudioData(buffer));
    cancelled();
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > MAX_ARCADE_AUDIO_SECONDS
      || !Number.isInteger(decoded.numberOfChannels) || decoded.numberOfChannels < 1 || decoded.numberOfChannels > 2
      || !Number.isFinite(decoded.sampleRate) || decoded.sampleRate < 8000 || decoded.sampleRate > 96000
      || decoded.length * decoded.numberOfChannels > 60_000_000) {
      throw new Error("Choose an audio file under 10 minutes with one or two channels at up to 96 kHz.");
    }
    return decoded;
  } finally {
    signal?.removeEventListener("abort", close);
    close();
  }
}
