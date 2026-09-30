import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canCreateWebGLContext } from "../src/utils/webglSupport.mjs";

test("WebGL capability probe requires WebGL 2, fails closed, and releases a successful probe context", () => {
  assert.equal(canCreateWebGLContext(() => ({ getContext: () => null })), false);

  const webgl1Only = {
    getContext(name) {
      return name === "webgl" ? {} : null;
    },
  };
  assert.equal(canCreateWebGLContext(() => webgl1Only), false);

  let released = 0;
  const context = {
    getExtension(name) {
      if (name !== "WEBGL_lose_context") return null;
      return { loseContext() { released += 1; } };
    },
  };
  const canvas = {
    getContext(name) {
      return name === "webgl2" ? context : null;
    },
  };

  assert.equal(canCreateWebGLContext(() => canvas), true);
  assert.equal(released, 1);
});

test("LightPillar gates Three.js renderer creation on the synchronous WebGL probe", async () => {
  const source = await readFile(
    new URL("../src/components/Backgrounds/LightPillar.jsx", import.meta.url),
    "utf8",
  );
  const guard = source.indexOf("canCreateWebGLContext()");
  const renderer = source.indexOf("new THREE.WebGLRenderer");
  assert.ok(guard >= 0, "LightPillar must check WebGL support in its renderer initialization path.");
  assert.ok(renderer > guard, "LightPillar must probe WebGL before constructing Three.js.");
});
