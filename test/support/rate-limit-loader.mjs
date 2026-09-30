import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

const mocks = {
  "@/models/RateLimit": "export default {};",
  "@/utils/dbconnect": "export default async function dbConnect() {};",
};

export async function resolve(specifier, context, nextResolve) {
  if (mocks[specifier]) {
    return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const path = resolvePath(root, "src", specifier.slice(2));
    const candidate = [path, `${path}.js`, `${path}.mjs`].find(existsSync);
    if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
