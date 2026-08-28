export const routes = [
  { pattern: "/", view: "home" },
  { pattern: "/search", view: "search" },
  { pattern: "/library", view: "library" },
  { pattern: "/settings", view: "settings" },
  { pattern: "/playlist/:id", view: "playlistDetail" },
  { pattern: "/track/:id", view: "trackDetail" },
  { pattern: "/youtube/:id", view: "youtubeVideoDetail" },
  { pattern: "/artist/:id", view: "artistDetail" },
  { pattern: "/album/:id", view: "albumDetail" },
  { pattern: "/charts", view: "charts" },
  { pattern: "/radio/:id", view: "radioStation" },
  { pattern: "/genre/:genre", view: "genre" },
];

export function matchRoute(path) {
  const segments = path.split("/").filter(Boolean);

  for (const route of routes) {
    const patternSegments = route.pattern.split("/").filter(Boolean);
    if (patternSegments.length !== segments.length) continue;

    const params = {};
    const matches = patternSegments.every((segment, index) => {
      if (!segment.startsWith(":")) return segment === segments[index];
      params[segment.slice(1)] = decodeURIComponent(segments[index]);
      return true;
    });
    if (matches) return { ...route, params };
  }

  return { pattern: "/", view: "home", params: {} };
}