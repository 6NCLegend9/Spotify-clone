export async function resolve(specifier, context, nextResolve) {
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
