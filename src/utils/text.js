// Decode HTML entities that upstream music/video APIs leave encoded in titles
// (e.g. "Troublesome &#39;96" -> "Troublesome '96", and double-encoded
// "&amp;#39;" which a single replace would leave as "&#39;"). Numeric refs
// also cover emoji / symbols (&#x1F3B5;, &#128153;).
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201D",
  ldquo: "\u201C",
  sbquo: "\u201A",
  bdquo: "\u201E",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  middot: "\u00B7",
  bull: "\u2022",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
  times: "\u00D7",
  deg: "\u00B0",
  euro: "\u20AC",
  pound: "\u00A3",
  yen: "\u00A5",
  cent: "\u00A2",
  laquo: "\u00AB",
  raquo: "\u00BB",
  shy: "",
};

const ENTITY_PATTERN = /&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi;
const PERCENT_ESCAPES = /%(?:27|22|26|3c|3e)/i;

function decodeEntityMatch(match, entity) {
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
}

function decodePercentEscapes(value) {
  return value
    .replace(/%27/gi, "'")
    .replace(/%22/gi, '"')
    .replace(/%26/gi, "&")
    .replace(/%3c/gi, "<")
    .replace(/%3e/gi, ">");
}

export function decodeHtmlEntities(value) {
  if (typeof value !== "string") return "";
  let current = value;
  for (let pass = 0; pass < 6; pass += 1) {
    let next = current;
    if (PERCENT_ESCAPES.test(next)) {
      next = decodePercentEscapes(next);
    }
    if (next.includes("&")) {
      next = next.replace(ENTITY_PATTERN, decodeEntityMatch);
    }
    if (next === current) break;
    current = next;
  }
  return current;
}

// Decode entities and trim; returns the fallback when the result is empty.
export function cleanTitle(value, fallback = "") {
  const decoded = decodeHtmlEntities(value).trim();
  return decoded || fallback;
}

export function decodeTrackFields(track) {
  if (!track || typeof track !== "object") return track;
  const next = { ...track };
  if (typeof next.title === "string") next.title = cleanTitle(next.title);
  if (typeof next.name === "string") next.name = cleanTitle(next.name);
  if (typeof next.channel === "string") next.channel = cleanTitle(next.channel);
  if (typeof next.description === "string") next.description = cleanTitle(next.description);
  if (typeof next.primaryArtists === "string") next.primaryArtists = cleanTitle(next.primaryArtists);
  if (typeof next.subtitle === "string") next.subtitle = cleanTitle(next.subtitle);
  if (typeof next.author === "string") next.author = cleanTitle(next.author);
  if (typeof next.author_name === "string") next.author_name = cleanTitle(next.author_name);
  return next;
}
