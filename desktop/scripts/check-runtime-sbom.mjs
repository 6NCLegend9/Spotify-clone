import assert from "node:assert/strict";
import test from "node:test";
import { includeElectronRuntime } from "./include-electron-in-sbom.mjs";

const versions = { declared: "44.10.1", locked: "44.10.1", installed: "44.10.1" };
const fixture = () => ({
  bomFormat: "CycloneDX", metadata: { component: { "bom-ref": "haykasa@1.1.0" } },
  components: [{ name: "electron-updater", version: "6.8.9", "bom-ref": "electron-updater@6.8.9" }],
  dependencies: [{ ref: "haykasa@1.1.0", dependsOn: ["electron-updater@6.8.9"] }],
});

test("distribution SBOM includes the required runtime and root link without adding build tools", () => {
  const result = includeElectronRuntime(fixture(), versions);
  const runtime = result.components.find(item => item.name === "electron");
  assert.equal(runtime.version, versions.installed);
  assert.equal(runtime.scope, "required");
  assert(result.dependencies[0].dependsOn.includes(runtime["bom-ref"]));
  assert.deepEqual(result.components.map(item => item.name).sort(), ["electron", "electron-updater"]);
  assert.deepEqual(includeElectronRuntime(structuredClone(result), versions), result, "idempotent generation");
});

test("a full npm component is marked as shipped even though the npm wrapper is a dev dependency", () => {
  const bom = fixture();
  bom.components.push({ name: "electron", version: versions.installed, "bom-ref": "electron@44.10.1", scope: "optional", properties: [{ name: "cdx:npm:package:development", value: "true" }] });
  const runtime = includeElectronRuntime(bom, versions).components.at(-1);
  assert.equal(runtime.scope, "required");
  assert(!runtime.properties.some(property => property.name === "cdx:npm:package:development"));
});

test("stale installs, conflicting versions and incomplete graphs fail closed", () => {
  for (const key of ["declared", "locked", "installed"]) {
    assert.throws(() => includeElectronRuntime(fixture(), { ...versions, [key]: "44.4.1" }), /must agree/);
  }
  const conflict = fixture();
  conflict.components.push({ name: "electron", version: "44.4.1" });
  assert.throws(() => includeElectronRuntime(conflict, versions), /conflicting/);
  assert.throws(() => includeElectronRuntime({}, versions), /CycloneDX/);
  assert.throws(() => includeElectronRuntime({ ...fixture(), dependencies: [] }, versions), /root dependency/);
});
