import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const mocks = {
  "@/models/User": "export default globalThis.__apiFixtures.User;",
  "@/models/UserData": "export default globalThis.__apiFixtures.UserData;",
  "@/models/Playlist": "export default globalThis.__apiFixtures.Playlist;",
  "@/models/Genre": "export default globalThis.__apiFixtures.Genre;",
  "@/models/Tag": "export default globalThis.__apiFixtures.Genre; export const TAG_CATEGORIES = ['other'];",
  "@/utils/dbconnect": "export default async function dbConnect() { globalThis.__apiFixtures.connect(); }",
  "@/utils/rateLimit": "export const isRateLimited = async () => ({ limited: false }); export const getClientKey = () => 'fixture';",
  "@/utils/mailSender": "export default async function mailSender() { globalThis.__apiFixtures.mail(); }",
  "@/utils/youtubeApi": "export const youtubeFetch = async () => ({ ok: true, status: 200, data: { items: [] } });",
  "@/services/genreCatalog": "export const ensureSystemGenres = async () => []; export const ensureSystemTags = async () => []; export const toCatalogItem = item => item;",
  "@/utils/siteConfig": "export const GOOGLE_SIGN_IN_ENABLED = false; export const SITE_URL = 'http://localhost:3000'; export const PRODUCTION_SITE_URL = 'https://example.test'; export const normalizeAppUrl = () => undefined; export const SITE_NAME = 'HeyKasa'; export const ORG_CONTACT_EMAIL = 'support@example.test';",
  "next-auth/jwt": "export const getToken = async () => globalThis.__apiFixtures.token();",
  "next-auth/providers/credentials": "export default options => options;",
  "next-auth/providers/google": "export default options => options;",
};

export async function resolve(specifier, context, nextResolve) {
  if (mocks[specifier]) {
    return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
  }
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  if (specifier.startsWith("@/") || (specifier.startsWith(".") && context.parentURL?.startsWith("file:"))) {
    const path = specifier.startsWith("@/")
      ? resolvePath(root, "src", specifier.slice(2))
      : fileURLToPath(new URL(specifier, context.parentURL));
    const candidate = [path, `${path}.js`, `${path}.mjs`].find((entry) => existsSync(entry));
    if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}