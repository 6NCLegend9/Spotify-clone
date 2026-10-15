export function uniqueSearchResults(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter(item => {
    if (!item || typeof item.id !== "string" || !item.id.trim() || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
