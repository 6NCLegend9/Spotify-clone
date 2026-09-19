const ALLOWED_ARTWORK_HOSTS = new Set([
  "i.ytimg.com",
  "yt3.ggpht.com",
  "lh3.googleusercontent.com",
]);

function byte(value) {
  return Math.min(255, Math.max(0, Math.round(Number(value) || 0)));
}

export function isAllowedArtworkUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && ALLOWED_ARTWORK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => byte(value).toString(16).padStart(2, "0")).join("")}`;
}

function luminanceChannel(value) {
  const channel = byte(value) / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(left, right) {
  const a = 0.2126 * luminanceChannel(left[0])
    + 0.7152 * luminanceChannel(left[1])
    + 0.0722 * luminanceChannel(left[2]);
  const b = 0.2126 * luminanceChannel(right[0])
    + 0.7152 * luminanceChannel(right[1])
    + 0.0722 * luminanceChannel(right[2]);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function saturation(red, green, blue) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  return max === 0 ? 0 : (max - min) / max;
}

function readableAccent(red, green, blue) {
  let next = [byte(red), byte(green), byte(blue)];
  const darkSurface = [2, 8, 19];
  for (let attempts = 0; attempts < 8 && contrastRatio(next, darkSurface) < 4.5; attempts += 1) {
    next = next.map((value) => byte(value + (255 - value) * 0.18));
  }
  return next;
}

export function accentFromBitmap(bitmap, { fallback = "#00e6e6" } = {}) {
  if (!Buffer.isBuffer(bitmap) || bitmap.length < 4) return fallback;
  const buckets = new Map();
  for (let index = 0; index + 3 < bitmap.length; index += 16) {
    const blue = bitmap[index];
    const green = bitmap[index + 1];
    const red = bitmap[index + 2];
    const alpha = bitmap[index + 3];
    if (alpha < 180) continue;
    const brightness = (red + green + blue) / (3 * 255);
    const colorSaturation = saturation(red, green, blue);
    if (brightness < 0.12 || brightness > 0.94 || colorSaturation < 0.18) continue;
    const quantized = [red, green, blue].map((value) => Math.round(value / 32) * 32);
    const key = quantized.join(",");
    const current = buckets.get(key) || { count: 0, score: 0, rgb: quantized };
    current.count += 1;
    current.score += colorSaturation * (0.65 + brightness);
    buckets.set(key, current);
  }
  const candidates = [...buckets.values()].sort(
    (left, right) => (right.count * right.score) - (left.count * left.score),
  );
  if (candidates.length === 0) return fallback;
  return rgbToHex(...readableAccent(...candidates[0].rgb));
}

export function foregroundForAccent(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!match) return "#001014";
  const rgb = match.slice(1).map((value) => Number.parseInt(value, 16));
  return contrastRatio(rgb, [0, 16, 20]) >= 4.5 ? "#001014" : "#ffffff";
}
