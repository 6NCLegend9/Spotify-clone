const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function resolveGhostFibersWorkload({
  isPhone = false,
  hardwareConcurrency,
  dpr = 1,
  fps = 45,
  layers = 4,
} = {}) {
  const cores = Number(hardwareConcurrency);
  const lowEnd = Boolean(
    isPhone
    || (Number.isFinite(cores) && cores > 0 && cores <= 4),
  );
  const requestedDpr = Number.isFinite(dpr) ? dpr : 1;
  const requestedFps = Number.isFinite(fps) ? fps : 45;
  const requestedLayers = Number.isFinite(layers) ? Math.round(layers) : 4;
  const boundedLayers = clamp(requestedLayers, 1, 4);

  return {
    dpr: isPhone ? 0.5 : lowEnd ? 0.6 : clamp(requestedDpr, 0.5, 0.9),
    fps: isPhone ? 24 : lowEnd ? 28 : clamp(requestedFps, 1, 42),
    layers: isPhone ? Math.min(boundedLayers, 2) : boundedLayers,
  };
}
