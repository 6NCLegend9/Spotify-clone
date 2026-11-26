import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const source = fs.readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
const placement = source.slice(source.indexOf("function positionMiniPlayer("), source.indexOf("function showMiniPlayerIfReady("));
const cases = [
  { name: "left monitor with negative coordinates", area: { x: -1920, y: 0, width: 1920, height: 1040 }, anchor: { x: -90, y: 1040, width: 24, height: 40 } },
  { name: "monitor above the primary", area: { x: 0, y: -1080, width: 1920, height: 1040 }, anchor: { x: 1830, y: -40, width: 24, height: 40 } },
  { name: "left taskbar", area: { x: 48, y: 0, width: 1872, height: 1080 }, anchor: { x: 0, y: 500, width: 48, height: 24 } },
  { name: "right taskbar", area: { x: 0, y: 0, width: 1872, height: 1080 }, anchor: { x: 1872, y: 1000, width: 48, height: 24 } },
  { name: "top taskbar", area: { x: 0, y: 48, width: 1920, height: 1032 }, anchor: { x: 10, y: 0, width: 24, height: 48 } },
  { name: "missing tray uses cursor monitor", area: { x: 1920, y: 0, width: 1280, height: 984 }, anchor: null },
];
for (const { name, area, anchor } of cases) test(name, () => {
  let position;
  const context = vm.createContext({
    miniWindow: { isDestroyed: () => false, getBounds: () => ({ width: 360, height: 148 }), setPosition: (x, y) => { position = { x, y }; } },
    tray: anchor ? { isDestroyed: () => false, getBounds: () => anchor } : null,
    screen: { getCursorScreenPoint: () => ({ x: area.x + 50, y: area.y + 50 }), getDisplayNearestPoint: () => ({ workArea: area }) },
  });
  vm.runInContext(placement, context); context.positionMiniPlayer();
  assert(position.x >= area.x + 8, "left edge remains inside the selected display");
  assert(position.y >= area.y + 8, "top edge remains inside the work area");
  assert(position.x + 360 <= area.x + area.width - 8, "right edge remains reachable");
  assert(position.y + 148 <= area.y + area.height - 8, "bottom edge remains reachable");
});
