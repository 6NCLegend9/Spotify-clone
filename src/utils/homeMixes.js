import { MOOD_OPTIONS } from "@/utils/moods";
import { PLAYLIST_CATEGORIES, PLAYLIST_THEMES } from "@/utils/playlistThemes";

export const MIX_PALETTES = [
  { from: "#0b1629", via: "#24aae2", to: "#1399c6", bar: "#0e8c7f" },
  { from: "#030814", via: "#162943", to: "#1399c6", bar: "#1171ba" },
  { from: "#101f36", via: "#24aae2", to: "#1399c6", bar: "#1171ba" },
  { from: "#162943", via: "#24aae2", to: "#1399c6", bar: "#1171ba" },
  { from: "#060d1b", via: "#101f36", to: "#1399c6", bar: "#1171ba" },
  { from: "#0b1629", via: "#162943", to: "#1399c6", bar: "#1171ba" },
  { from: "#101f36", via: "#24aae2", to: "#1399c6", bar: "#1171ba" },
  { from: "#030814", via: "#0b1629", to: "#1399c6", bar: "#1171ba" },
];

function paletteFromGradient(gradient, bar) {
  const hexes = String(gradient || "").match(/#(?:[0-9a-f]{3,8})/gi) || [];
  return {
    from: hexes[0] || "#101f36",
    via: hexes[1] || hexes[0] || "#24aae2",
    to: hexes[2] || "#096192",
    bar: bar || "#096192",
  };
}

export function mixBackground(palette = {}) {
  const from = palette.from || "#101f36";
  const via = palette.via || from;
  const to = palette.to || "#096192";
  return `linear-gradient(rgb(3 8 20 / 40%), rgb(3 8 20 / 40%)), linear-gradient(145deg, ${from} 0%, ${via} 52%, ${to} 100%)`;
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
