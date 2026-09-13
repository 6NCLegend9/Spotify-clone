import assert from "node:assert/strict";
import test from "node:test";

import { isOutsideDismissTarget } from "../src/hooks/useDismissOnOutside.js";

function node(id, parent = null) {
  const element = {
    id,
    parent,
    contains(other) {
      let current = other;
      while (current) {
        if (current === element) return true;
        current = current.parent;
      }
      return false;
    },
  };
  return element;
}

test("outside dismiss treats clicks inside any root as inside", () => {
  const panel = node("panel");
  const keep = node("keep", panel);
  const away = node("away");

  assert.equal(isOutsideDismissTarget(keep, [panel]), false);
  assert.equal(isOutsideDismissTarget(panel, [panel]), false);
  assert.equal(isOutsideDismissTarget(away, [panel]), true);
  assert.equal(isOutsideDismissTarget(away, [panel, away]), false);
  assert.equal(isOutsideDismissTarget(null, [panel]), true);
});

test("outside dismiss uses the box bounds when a pointer point is provided", () => {
  const panel = {
    getBoundingClientRect: () => ({ left: 100, right: 400, top: 40, bottom: 500, width: 300, height: 460 }),
    contains: () => true,
  };

  assert.equal(isOutsideDismissTarget(panel, [panel], { x: 200, y: 80 }), false);
  assert.equal(isOutsideDismissTarget(panel, [panel], { x: 12, y: 12 }), true);
});
