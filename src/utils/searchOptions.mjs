import { ApiRouteError } from "./apiResponseCore.mjs";

export function readSearchOptions(parameters) {
  const query = (parameters.get("q") || "").normalize("NFC").trim();
  const type = parameters.get("type") || "video";
  const order = parameters.get("order") || "relevance";
  const duration = parameters.get("duration") || "any";
  const pageToken = parameters.get("pageToken") || "";
  if (!query || query.length > 100 || !["video", "channel", "playlist"].includes(type)
    || !["relevance", "date"].includes(order) || !["any", "short", "medium", "long"].includes(duration)
    || (type !== "video" && duration !== "any") || pageToken.length > 512
    || pageToken && !/^[A-Za-z0-9_=.\-]+$/.test(pageToken)) {
    throw new ApiRouteError("VALIDATION_ERROR", { message: "Invalid search parameters." });
  }
  return { query, type, order, duration, pageToken,
    requireOfficial: order !== "relevance" || duration !== "any" || Boolean(pageToken) };
}