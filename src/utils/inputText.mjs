// Keep non-Latin and RTL names, but require visible, well-formed text.
const CONTROL = /\p{Cc}/u;
const VISIBLE = /[^\p{White_Space}\p{Cf}\p{Cc}\p{Mn}\p{Me}]/u;
const BROKEN_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

export function displayName(value, maxLength, { truncate = false } = {}) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (CONTROL.test(text) || BROKEN_SURROGATE.test(text) || !VISIBLE.test(text)) return "";
  if (text.length <= maxLength) return text;
  if (!truncate) return "";
  let clipped = "";
  for (const character of text) {
    if (clipped.length + character.length > maxLength) break;
    clipped += character;
  }
  return VISIBLE.test(clipped) ? clipped : "";
}
