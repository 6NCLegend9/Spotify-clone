const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 400;
const JPEG_QUALITY = 0.78;

// Shown when an artwork/thumbnail can't load (deleted video, offline host, blocked request).
export const THUMB_FALLBACK =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='160'%20height='160'%3E%3Crect%20width='160'%20height='160'%20fill='%230b1622'/%3E%3Cpath%20d='M96%2048v46a16%2016%200%201%201-8-13V60l-24%205v40a16%2016%200%201%201-8-13V54z'%20fill='%232b3a4a'/%3E%3C/svg%3E";

export function youtubeThumb(url, size = "mq") {
  if (!url || typeof url !== "string") return url || "";
  // yt3.googleusercontent.com serves the same avatars as yt3.ggpht.com (the host allowed by
  // our image CSP); normalize so channel/artist avatars aren't blocked.
  const normalized = url.replace("//yt3.googleusercontent.com/", "//yt3.ggpht.com/");
  const match = normalized.match(/\/vi\/([^/]+)\//);
  if (!match) return normalized;
  const file =
    size === "maxres"
      ? "maxresdefault.jpg"
      : size === "sd"
      ? "sddefault.jpg"
      : size === "hq"
      ? "hqdefault.jpg"
      : "mqdefault.jpg";
  return `https://i.ytimg.com/vi/${match[1]}/${file}`;
}

function preparationStep(create, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let dispose = () => {};
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      dispose(error);
      if (error) reject(error); else resolve(value);
    };
    const cancel = () => finish(new DOMException("Image preparation cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error("Image preparation timed out. Try another image.")), 15_000);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      dispose = create(finish) || dispose;
      if (settled) dispose();
    } catch (error) { finish(error); }
  });
}

function loadImage(src, signal) {
  return preparationStep((finish) => {
    const image = new Image();
    image.onload = () => finish(null, image);
    image.onerror = () => finish(new Error("That image could not be read. Try a JPG or PNG file."));
    image.src = src;
    return (error) => { image.onload = null; image.onerror = null; if (error) image.src = ""; };
  }, signal);
}

export async function resizeCoverFile(file, { signal } = {}) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("Choose a nonempty image to use as a cover.");
  }
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Use a JPG, PNG, or WebP image.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Keep cover images under 8 MB.");

  const dataUrl = await preparationStep((finish) => {
    const reader = new FileReader();
    reader.onload = () => finish(null, String(reader.result || ""));
    reader.onerror = () => finish(new Error("The image could not be read."));
    reader.onabort = () => finish(new DOMException("Image preparation cancelled", "AbortError"));
    reader.readAsDataURL(file);
    return () => {
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      if (reader.readyState === 1) reader.abort();
    };
  }, signal);

  const image = await loadImage(dataUrl, signal);
  if (!image.width || !image.height || image.width > 8192 || image.height > 8192 || image.width * image.height > 16_000_000) {
    throw new Error("Choose an image under 16 megapixels and 8,192 pixels per side.");
  }
  const side = Math.min(image.width, image.height);
  const sx = Math.floor((image.width - side) / 2);
  const sy = Math.floor((image.height - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot resize images.");
  context.drawImage(image, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  const output = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (output.length > 280_000) {
    return canvas.toDataURL("image/jpeg", 0.62);
  }
  return output;
}
