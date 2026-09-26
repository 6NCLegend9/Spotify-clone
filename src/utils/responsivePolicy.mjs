export const PHONE_PORTRAIT_QUERY = "(max-width: 767px)";
export const PHONE_LANDSCAPE_QUERY =
  "(orientation: landscape) and (max-height: 540px) and (max-width: 1100px)";
export const PHONE_QUERY = `${PHONE_PORTRAIT_QUERY}, ${PHONE_LANDSCAPE_QUERY}`;
export const COMPACT_TOUCH_QUERY =
  `${PHONE_QUERY}, (pointer: coarse) and (max-width: 1180px) and (max-height: 900px)`;
export const DESKTOP_QUERY = "(min-width: 768px) and (pointer: fine)";

function finiteDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function responsiveLayoutForViewport({ width, height, pointer = "fine" } = {}) {
  const viewportWidth = finiteDimension(width);
  const viewportHeight = finiteDimension(height);
  const pointerKind = pointer === "coarse" ? "coarse" : "fine";
  const phonePortrait = viewportWidth <= 767;
  const phoneLandscape =
    viewportWidth > viewportHeight
    && viewportHeight <= 540
    && viewportWidth <= 1100;
  const phone = phonePortrait || phoneLandscape;
  const compactTouch =
    phone
    || (pointerKind === "coarse" && viewportWidth <= 1180 && viewportHeight <= 900);
  const desktop = !compactTouch && pointerKind === "fine";
  return { phone, compactTouch, desktop };
}

export function initialMediaQueryMatch(query, matchMedia) {
  if (typeof query !== "string" || !query.trim() || typeof matchMedia !== "function") return false;
  try {
    return matchMedia(query).matches === true;
  } catch {
    return false;
  }
}
