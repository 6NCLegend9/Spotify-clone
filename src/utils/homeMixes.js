import { MOOD_OPTIONS } from "@/utils/moods";
import { PLAYLIST_CATEGORIES, PLAYLIST_THEMES } from "@/utils/playlistThemes";

export const MIX_PALETTES = [
  { from: "#4c1d95", via: "#7c3aed", to: "#22d3ee", bar: "#67e8f9" },
  { from: "#9f1239", via: "#e11d48", to: "#fb7185", bar: "#fda4af" },
  { from: "#0f766e", via: "#155e75", to: "#00e6e6", bar: "#67e8f9" },
  { from: "#1e3a8a", via: "#2563eb", to: "#38bdf8", bar: "#7dd3fc" },
  { from: "#7c2d12", via: "#ea580c", to: "#fbbf24", bar: "#fde68a" },
  { from: "#111827", via: "#334155", to: "#00e6e6", bar: "#5eead4" },
  { from: "#6d28d9", via: "#db2777", to: "#00e6e6", bar: "#f9a8d4" },
  { from: "#14532d", via: "#16a34a", to: "#67e8f9", bar: "#86efac" },
];

function paletteFromGradient(gradient, bar) {
  const hexes = String(gradient || "").match(/#(?:[0-9a-f]{3,8})/gi) || [];
  return {
    from: hexes[0] || "#0b1722",
    via: hexes[1] || hexes[0] || "#128a9a",
    to: hexes[2] || "#00e6e6",
    bar: bar || "#00e6e6",
  };
}

export function mixBackground(palette = {}) {
  const from = palette.from || "#0b1722";
  const via = palette.via || from;
  const to = palette.to || "#00e6e6";
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
