import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const mocks = {
  "next/server": "export const NextResponse = { json: (body, options) => Response.json(body, options) };",
  "@/utils/rateLimit": "export const getClientKey = () => 'test-client'; export const isRateLimited = async () => ({ limited: false, retryAfter: 0 });",
  "@/utils/youtubeApi": `export const hasYouTubeApiKey = () => true;
    export const youtubeFetch = async () => ({
      ok: true, status: 200, source: "official",
      data: { items: [
        { id: { videoId: "abcdefghijk" }, snippet: { title: "Hello (Official Video)", channelTitle: "Adele", description: "", publishedAt: "", thumbnails: {} } },
        { id: { videoId: "bcdefghijkl" }, snippet: { title: "Stay With Me (Official Video)", channelTitle: "Sam Smith", description: "", publishedAt: "", thumbnails: {} } },
        { id: { videoId: "cdefghijklm" }, snippet: { title: "All I Ask (Official Audio)", channelTitle: "Adele", description: "", publishedAt: "", thumbnails: {} } },
        { id: { videoId: "defghijklmn" }, snippet: { title: "Someone You Loved (Official Video)", channelTitle: "Lewis Capaldi", description: "", publishedAt: "", thumbnails: {} } }
      ] }
    });
    export const searchYouTubeChannels = async () => ({ ok: true, status: 200, source: "official", data: { items: [] } });`,
};

export async function resolve(specifier, context, nextResolve) {
  if (mocks[specifier]) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const path = resolvePath(root, "src", specifier.slice(2));
    const candidate = [path, `${path}.js`, `${path}.mjs`].find(existsSync);
    if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
