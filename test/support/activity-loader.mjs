import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const mocks = {
  'next/server': 'export const NextResponse = { json: (body, options) => Response.json(body, options) };',
  '@/models/UserData': 'export default globalThis.__activityFixtures.model;',
  '@/utils/userAccount': 'export const getAuthenticatedAccount = async () => globalThis.__activityFixtures.account();',
  '@/utils/rateLimit': 'export const isRateLimited = async () => ({ limited: globalThis.__activityFixtures.limited, retryAfter: 60 });',
  './diagnostics.mjs': 'export const diagnosticRecord = () => ({});',
};
export async function resolve(specifier, context, nextResolve) {
  if (mocks[specifier]) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const path = resolvePath(root, 'src', specifier.slice(2));
    const candidate = [path, `${path}.js`, `${path}.mjs`].find(existsSync);
    if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
