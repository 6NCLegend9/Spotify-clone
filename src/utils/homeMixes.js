import { MOOD_OPTIONS } from "@/utils/moods";
import { PLAYLIST_CATEGORIES, PLAYLIST_THEMES } from "@/utils/playlistThemes";

export const MIX_PALETTES = [
  { from: "#0b1629", via: "#096192", to: "#1171ba", bar: "#0e8c7f" },
  { from: "#030814", via: "#162943", to: "#1171ba", bar: "#1399c6" },
  { from: "#101f36", via: "#096192", to: "#1171ba", bar: "#1399c6" },
  { from: "#162943", via: "#096192", to: "#1171ba", bar: "#1399c6" },
  { from: "#060d1b", via: "#101f36", to: "#1171ba", bar: "#1399c6" },
  { from: "#0b1629", via: "#162943", to: "#1171ba", bar: "#1399c6" },
  { from: "#101f36", via: "#096192", to: "#1171ba", bar: "#1399c6" },
  { from: "#030814", via: "#0b1629", to: "#1171ba", bar: "#1399c6" },
];

function paletteFromGradient(gradient, bar) {
  const hexes = String(gradient || "").match(/#(?:[0-9a-f]{3,8})/gi) || [];
  return {
    from: hexes[0] || "#101f36",
    via: hexes[1] || hexes[0] || "#096192",
    to: hexes[2] || "#24aae2",
    bar: bar || "#24aae2",
  };
}

export function mixBackground(palette = {}) {
  const from = palette.from || "#101f36";
  const via = palette.via || from;
  const to = palette.to || "#24aae2";
  return `linear-gradient(145deg, ${from} 0%, ${via} 52%, ${to} 100%)`;
}

export function daypartLabel(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function soundtrackHeading(date = new Date()) {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return `Soundtrack your ${weekday} ${daypartLabel(date)}`;
}

export function buildMoodMixes() {
  return MOOD_OPTIONS.map((mood, index) => ({
    id: `mood-${mood.id}`,
    title: `${mood.label} Mix`,
    query: mood.query,
    kind: "search",
      palette: MIX_PALETTES[index % MIX_PALETTES.length],
  }));
}

export function buildCategoryMixes() {
  return PLAYLIST_CATEGORIES.map((category) => {
    const theme = PLAYLIST_THEMES[category];
    return {
      id: `cat-${category}`,
      title: `${category} Mix`,
      query: `${category} music mix`,
      kind: "search",
      palette: paletteFromGradient(theme?.gradient, theme?.accent),
      stamp: "FOR YOU",
    };
  });
}
