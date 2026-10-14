import sharp from "sharp";
import { ApiRouteError } from "./apiResponseCore.mjs";
import { isCoverDataUrl } from "./playlistThemes";

export async function validatedCover(value) {
  if (value === undefined || value === "") return "";
  const invalid = () => new ApiRouteError("VALIDATION_ERROR", {
    message: "Choose a valid JPG, PNG, or WebP cover under the size limit.",
  });
  if (!isCoverDataUrl(value)) throw invalid();
  const comma = value.indexOf(",");
  const encoded = value.slice(comma + 1);
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.toString("base64") !== encoded) throw invalid();
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    const expected = value.slice(11, comma - 7);
    if (metadata.format !== expected || !metadata.width || !metadata.height
      || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages || 1) > 1) throw invalid();
    const output = await image.rotate().resize(400, 400, { fit: "cover" }).jpeg({ quality: 78 }).timeout({ seconds: 3 }).toBuffer();
    const result = `data:image/jpeg;base64,${output.toString("base64")}`;
    if (!isCoverDataUrl(result)) throw invalid();
    return result;
  } catch {
    throw invalid();
  }
}
