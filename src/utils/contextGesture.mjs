export function createContextGesture(open, schedule = setTimeout, cancel = clearTimeout) {
  let timer, origin, consumed = false, reset;
  const clear = () => { cancel(timer); timer = undefined; };
  return {
    down(event) {
      clear(); cancel(reset); consumed = false;
      if (event.pointerType !== "touch" || event.isPrimary === false) return;
      origin = { x: event.clientX, y: event.clientY };
      timer = schedule(() => { consumed = true; open(); }, 550);
    },
    move(event) {
      if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) clear();
    },
    up() { clear(); reset = schedule(() => { consumed = false; }, 700); },
    cancel() { clear(); cancel(reset); origin = null; consumed = false; },
    consumeClick() { const result = consumed; consumed = false; return result; },
  };
}
