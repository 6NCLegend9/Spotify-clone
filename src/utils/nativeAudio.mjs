export function resumeAudioContext(context) {
  if (!context || !["suspended", "interrupted"].includes(context.state)) return Promise.resolve();
  try { return Promise.resolve(context.resume()); }
  catch (error) { return Promise.reject(error); }
}

export function playNativeAudio(audio, resumeContext) {
  if (!audio) return Promise.resolve();
  try {
    const context = resumeContext?.();
    const playback = audio.play();
    return Promise.all([context, playback]).then(() => undefined);
  } catch (error) {
    return Promise.reject(error);
  }
}