const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 400;
const JPEG_QUALITY = 0.78;

export function youtubeThumb(url, size = "mq") {
  if (!url || typeof url !== "string") return url || "";
  const match = url.match(/\/vi\/([^/]+)\//);
  if (!match) return url;
  const file = size === "hq" ? "hqdefault.jpg" : "mqdefault.jpg";
  return `https://i.ytimg.com/vi/${match[1]}/${file}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be read. Try a JPG or PNG file."));
    image.src = src;
  });
}

export async function resizeCoverFile(file) {
  if (!file) {
    throw new Error("Choose an image to use as a cover.");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Use a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Keep cover images under 8 MB.");
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });

  const image = await loadImage(dataUrl);
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

export function isCoverDataUrl(value) {
  return typeof value === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(value) && value.length <= 320_000;
}
