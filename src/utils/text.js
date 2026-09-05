// Decode HTML entities that upstream music/video APIs leave encoded in titles
// (e.g. "It Ain&#39;t Easy" -> "It Ain't Easy"). Handles named entities plus
// numeric decimal (&#39;) and hexadecimal (&#x27;) references.
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeHtmlEntities(value) {
  if (typeof value !== "string" || !value.includes("&")) {
    return typeof value === "string" ? value : "";
  }
  return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const decoded = NAMED_ENTITIES[entity.toLowerCase()];
    return decoded === undefined ? match : decoded;
  });
}

// Decode entities and trim; returns the fallback when the result is empty.
export function cleanTitle(value, fallback = "") {
  const decoded = decodeHtmlEntities(value).trim();
  return decoded || fallback;
}
