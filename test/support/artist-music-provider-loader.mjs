export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/cache") {
    return { url: `data:text/javascript,${encodeURIComponent("export function unstable_cache(fn) { return fn; }")}`, shortCircuit: true };
  }
  if (specifier === "youtubei.js") {
    const source = `
      export const Log = { Level: { ERROR: 0 }, setLevel() {} };
      export class UniversalCache {}
      export const Innertube = { create: async () => ({
        music: {
          getArtist: (...args) => globalThis.__artistMusicProviderFixture.music.getArtist(...args),
          getAlbum: (...args) => globalThis.__artistMusicProviderFixture.music.getAlbum(...args)
        },
        getPlaylist: (...args) => globalThis.__artistMusicProviderFixture.getPlaylist(...args)
      }) };
    `;
    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
