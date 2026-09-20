export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/cache") {
    const source = `
      export function unstable_cache(fn) {
        return async () => fn();
      }
    `;
    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  }
  if (specifier === "youtubei.js") {
    const source = `
      export const Log = { Level: { ERROR: 0 }, setLevel() {} };
      export class UniversalCache {}
      export const Innertube = { create: async () => ({
        search: async (...args) => globalThis.__youtubeSearchFixture(...args)
      }) };
    `;
    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
