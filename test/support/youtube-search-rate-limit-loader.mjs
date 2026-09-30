import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const rateLimitMock = `
export const getClientKey = (_request, scope = "") => scope || "base";
export const isRateLimited = async (key, options = {}) => {
  const state = globalThis.__YT_RATE_LIMIT_STATE ||= { counts: Object.create(null), calls: [] };
  state.calls.push({ key, options });
  const overrides = globalThis.__YT_RATE_LIMIT_OVERRIDES || {};
  const max = Number.isFinite(overrides[key]) ? overrides[key] : Number(options.max || 20);
  const count = (state.counts[key] || 0) + 1;
  state.counts[key] = count;
  return { limited: count > max, remaining: Math.max(0, max - count), retryAfter: 37 };
};
`;

const mocks = {
  "next/server": "export const NextResponse = { json: (body, options) => Response.json(body, options) };",
  "@/utils/rateLimit": rateLimitMock,
  "@/utils/youtubeApi": `export const hasYouTubeApiKey = () => true;
    export const youtubeFetch = async () => ({
      ok: true, status: 200, source: "official",
      data: { items: [
        { id: { videoId: "abcdefghijk" }, snippet: { title: "Hello (Official Video)", channelTitle: "Adele", description: "", publishedAt: "", thumbnails: {} } }
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
