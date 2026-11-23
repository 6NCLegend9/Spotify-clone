import fs from "node:fs/promises";

export const LOCAL_UI_SCHEME = "heykasa-ui";
const pages = new Map([
  ["/offline.html", new URL("./offline.html", import.meta.url)],
  ["/miniPlayer.html", new URL("./miniPlayer.html", import.meta.url)],
]);
const installed = new WeakSet();

export function localPageUrl(name) {
  if (!pages.has(`/${name}`)) throw new Error("Unknown bundled desktop page.");
  return `${LOCAL_UI_SCHEME}://bundled/${name}`;
}

// The renderer never supplies filesystem paths. Only these two bundled HTML
// resources are exposed, without enabling file:// privileges for remote pages.
export async function bundledPageResponse(request) {
  if (request.method !== "GET") return new Response(null, { status: 405 });
  let url;
  try { url = new URL(request.url); } catch { return new Response(null, { status: 400 }); }
  const file = pages.get(url.pathname);
  if (url.protocol !== `${LOCAL_UI_SCHEME}:` || url.hostname !== "bundled"
    || url.port || url.username || url.password || url.search || url.hash || !file) {
    return new Response(null, { status: 404 });
  }
  try {
    return new Response(await fs.readFile(file), { headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "frame-ancestors 'none'",
    } });
  } catch { return new Response(null, { status: 503 }); }
}

export function installLocalPages(session) {
  if (installed.has(session)) return;
  session.protocol.handle(LOCAL_UI_SCHEME, bundledPageResponse);
  installed.add(session);
}
