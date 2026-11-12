import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// npm classifies Electron as a build-time package. electron-builder nevertheless
// ships its browser/Node runtime, so the distribution SBOM must name it explicitly.
export function includeElectronRuntime(bom, versions) {
  const { declared, locked, installed } = versions;
  if (!/^\d+\.\d+\.\d+$/.test(declared || "") || declared !== locked || locked !== installed) {
    throw new Error("Declared, locked and installed Electron versions must agree.");
  }
  const rootRef = bom?.metadata?.component?.["bom-ref"];
  if (bom?.bomFormat !== "CycloneDX" || !rootRef || !Array.isArray(bom.components) || !Array.isArray(bom.dependencies)) {
    throw new Error("Expected npm's CycloneDX SBOM with its dependency graph.");
  }
  const matches = bom.components.filter(component => component.name === "electron");
  if (matches.length > 1 || matches.some(component => component.version !== declared)) {
    throw new Error("SBOM contains conflicting Electron components.");
  }
  const component = matches[0] || {
    type: "framework", name: "electron", version: declared,
    "bom-ref": `electron@${declared}`, purl: `pkg:npm/electron@${declared}`,
    licenses: [{ license: { id: "MIT" } }],
  };
  component.scope = "required";
  component.properties = (component.properties || []).filter(property => property.name !== "cdx:npm:package:development");
  if (!component.properties.some(property => property.name === "haykasa:distribution:role")) {
    component.properties.push({ name: "haykasa:distribution:role", value: "shipped Electron runtime" });
  }
  if (!matches.length) bom.components.push(component);
  const root = bom.dependencies.find(item => item.ref === rootRef);
  if (!root || !Array.isArray(root.dependsOn)) throw new Error("SBOM root dependency entry is missing.");
  if (!root.dependsOn.includes(component["bom-ref"])) root.dependsOn.push(component["bom-ref"]);
  if (!bom.dependencies.some(item => item.ref === component["bom-ref"])) {
    bom.dependencies.push({ ref: component["bom-ref"], dependsOn: [] });
  }
  return bom;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: node include-electron-in-sbom.mjs <runtime-sbom.cdx.json>");
  const read = url => JSON.parse(fs.readFileSync(url, "utf8").replace(/^\uFEFF/, ""));
  const pkg = read(new URL("../package.json", import.meta.url));
  const lock = read(new URL("../package-lock.json", import.meta.url));
  const electron = read(new URL("../node_modules/electron/package.json", import.meta.url));
  const bom = includeElectronRuntime(read(file), {
    declared: pkg.devDependencies.electron,
    locked: lock.packages["node_modules/electron"].version,
    installed: electron.version,
  });
  fs.writeFileSync(file, `${JSON.stringify(bom, null, 2)}\n`);
  console.log(`Runtime SBOM includes required Electron ${electron.version}; build-only dependencies remain excluded.`);
}
