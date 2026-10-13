export const LIBRARY_SORTS = [["recents", "Recents"], ["added", "Recently added"], ["alphabetical", "Alphabetical"], ["creator", "Creator"]];

export function sortLibraryItems(items, sort = "recents") {
  const text = (item) => String(item.title || item.name || "");
  const creator = (item) => String(item.creator || item.user?.userName || "");
  const timestamp = (value) => { const date = Date.parse(value); return Number.isFinite(date) ? date : 0; };
  return [...items].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
    if (sort === "alphabetical") return text(left).localeCompare(text(right));
    if (sort === "creator") return creator(left).localeCompare(creator(right)) || text(left).localeCompare(text(right));
    const field = sort === "added" ? "createdAt" : "updatedAt";
    return timestamp(right[field]) - timestamp(left[field]) || text(left).localeCompare(text(right));
  });
}
