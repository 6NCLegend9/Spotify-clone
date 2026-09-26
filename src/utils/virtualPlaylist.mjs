export const PLAYLIST_VIRTUALIZE_THRESHOLD = 200;
export const PLAYLIST_ROW_HEIGHT = 66;
export const PLAYLIST_OVERSCAN = 12;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function shouldVirtualizePlaylist(count) {
  return Number(count) >= PLAYLIST_VIRTUALIZE_THRESHOLD;
}

export function virtualPlaylistRange({
  count,
  rowHeight = PLAYLIST_ROW_HEIGHT,
  containerTop = 0,
  viewportHeight = 0,
  overscan = PLAYLIST_OVERSCAN,
} = {}) {
  const totalCount = Math.max(0, Math.floor(Number(count) || 0));
  const height = Math.max(1, Number(rowHeight) || PLAYLIST_ROW_HEIGHT);
  const totalHeight = totalCount * height;
  if (totalCount === 0) return { start: 0, end: 0, totalHeight: 0, offsetTop: 0 };

  const top = Number(containerTop) || 0;
  const viewport = Math.max(0, Number(viewportHeight) || 0);
  const extra = Math.max(0, Math.floor(Number(overscan) || 0));
  const visibleTop = clamp(-top, 0, totalHeight);
  const visibleBottom = clamp(viewport - top, 0, totalHeight);
  const start = clamp(Math.floor(visibleTop / height) - extra, 0, totalCount);
  const end = clamp(Math.ceil(visibleBottom / height) + extra, start, totalCount);

  return {
    start,
    end,
    totalHeight,
    offsetTop: start * height,
  };
}


export function playlistScrollOffsetForIndex({
  index,
  count,
  rowHeight = PLAYLIST_ROW_HEIGHT,
  viewportHeight = 0,
} = {}) {
  const totalCount = Math.max(0, Math.floor(Number(count) || 0));
  if (totalCount === 0) return 0;

  const height = Math.max(1, Number(rowHeight) || PLAYLIST_ROW_HEIGHT);
  const viewport = Math.max(0, Number(viewportHeight) || 0);
  const targetIndex = clamp(Math.floor(Number(index) || 0), 0, totalCount - 1);
  const totalHeight = totalCount * height;
  const centered = targetIndex * height - Math.max(0, viewport - height) / 2;

  return clamp(centered, 0, Math.max(0, totalHeight - viewport));
}
