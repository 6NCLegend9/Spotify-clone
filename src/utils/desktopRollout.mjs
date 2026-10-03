export const DEFAULT_DESKTOP_STABLE_ROLLOUT_PERCENT = 25;

export function desktopRolloutPercent(value, fallback = DEFAULT_DESKTOP_STABLE_ROLLOUT_PERCENT) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const number = Number(text);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, Math.round(number)))
    : fallback;
}
