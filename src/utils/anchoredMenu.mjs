export function placeAnchoredMenu({
  trigger,
  menuHeight,
  menuWidth,
  viewportWidth,
  viewportHeight,
  gap = 4,
  pad = 8,
}) {
  const width = Math.min(menuWidth, Math.max(0, viewportWidth - pad * 2));
  const left = Math.max(pad, Math.min(trigger.right - width, viewportWidth - width - pad));
  const below = trigger.bottom + gap;
  const top = below + menuHeight <= viewportHeight - pad
    ? below
    : Math.max(pad, trigger.top - menuHeight - gap);
  return { top, left };
}
