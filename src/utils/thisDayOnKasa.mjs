import { isYoutubeVideoId } from "./youtubeComments.mjs";

export function likedOnThisDay(favouriteAddedAt, now = new Date()) {
  const month = now.getMonth();
  const day = now.getDate();
  const year = now.getFullYear();
  const items = [];
  const source = favouriteAddedAt instanceof Map
    ? Object.fromEntries(favouriteAddedAt)
    : favouriteAddedAt && typeof favouriteAddedAt === "object"
      ? favouriteAddedAt
      : {};
  for (const [id, value] of Object.entries(source)) {
    if (!isYoutubeVideoId(id) || value == null) continue;
    const liked = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(liked.getTime())) continue;
    if (liked.getMonth() !== month || liked.getDate() !== day || liked.getFullYear() >= year) continue;
    items.push({ id, year: liked.getFullYear(), at: liked.getTime() });
  }
  items.sort((first, second) => second.year - first.year || first.id.localeCompare(second.id));
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 12);
}
