function finiteOr(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function resolveGhostFiberWorkload({
  isPhone = false,
  hardwareConcurrency,
  dpr = 1,
  fps = 45,
  layers = 4,
} = {}) {
  const cores = Number(hardwareConcurrency);
  const lowEnd = isPhone || (Number.isFinite(cores) && cores > 0 && cores <= 4);
  const requestedDpr = finiteOr(dpr, 1);
  const requestedFps = finiteOr(fps, 45);
  const requestedLayers = Math.max(1, Math.floor(finiteOr(layers, 4)));

  return {
    dpr: isPhone
      ? 0.5
      : lowEnd
        ? 0.6
        : Math.min(Math.max(requestedDpr, 0.5), 0.9),
    fps: isPhone
      ? 24
      : lowEnd
        ? 28
        : Math.min(Math.max(requestedFps, 1), 42),
    layers: isPhone
      ? Math.min(requestedLayers, 2)
      : Math.min(requestedLayers, 4),
  };
}
