const EMBED_PATH = /^\/embed(?:\/|$)/;

export function isEmbedPath(pathname) {
  return EMBED_PATH.test(String(pathname || "").split("?")[0]);
}
