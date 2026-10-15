import { MOOD_OPTIONS } from "@/utils/moods";
import { PLAYLIST_CATEGORIES, PLAYLIST_THEMES } from "@/utils/playlistThemes";

export const MIX_PALETTES = [
  { from: "#096192", via: "#1171ba", to: "#1399c6", bar: "#24aae2" },
  { from: "#1171ba", via: "#1399c6", to: "#24aae2", bar: "#0e8c7f" },
  { from: "#0e8c7f", via: "#1399c6", to: "#096192", bar: "#24aae2" },
  { from: "#24aae2", via: "#1399c6", to: "#1171ba", bar: "#0e8c7f" },
  { from: "#1399c6", via: "#0e8c7f", to: "#096192", bar: "#24aae2" },
  { from: "#096192", via: "#1171ba", to: "#24aae2", bar: "#1399c6" },
  { from: "#0e8c7f", via: "#096192", to: "#1171ba", bar: "#24aae2" },
  { from: "#1171ba", via: "#24aae2", to: "#1399c6", bar: "#0e8c7f" },
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
