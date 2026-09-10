import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier !== "@reduxjs/toolkit") return nextResolve(specifier, context);
  const require = createRequire(context.parentURL);
  const url = pathToFileURL(require.resolve(specifier)).href;
  const source = `import toolkit from ${JSON.stringify(url)}; export const { createSlice } = toolkit;`;
  return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
}