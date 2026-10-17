import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { EventEmitter } from "node:events";

// Execute the actual Electron lifecycle functions with controlled window events.
// No display server, network, account data or installed app is required.
const source = fs.readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
function between(start, end) {
  const from = source.indexOf(`function ${start}(`);
  const to = source.indexOf(`function ${end}(`, from);
  assert(from >= 0 && to > from, `Find production functions ${start}–${end}`);
  return source.slice(from, to);
}
function harness(hasTrack = true) {
  const windows = [], errors = [], timers = new Map(); let timerId = 0;
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.visible = options.show; this.destroyed = false;
      this.messages = [];
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = {};
      this.webContents.send = (...message) => this.messages.push(message);
      this.loading = new Promise((resolve, reject) => { this.loaded = resolve; this.failed = reject; });
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    hide() { this.visible = false; }
    show() { assert(!this.destroyed); this.visible = true; }
    destroy() { this.destroyed = true; this.hide(); this.emit("closed"); }
    loadFile() { return this.loading; }
    getBounds() { return { width: 360, height: 148 }; }
    setPosition() {}
    setMenu() {}
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
  }
  const context = vm.createContext({
    BrowserWindow: Window, path, __dirname: "/isolated", MINI_PARTITION: "test",
    session: { fromPartition: () => ({}) }, app: { isPackaged: true }, logger: null,
    dialog: { showErrorBox: (...args) => errors.push(args) },
    installAppearanceProtocol() {}, denyGuestContents() {}, installPopupGuard() {},
    resolvedAppearance: () => null, updateTrayMenu() {}, updateThumbar() {}, refreshAppearanceAccent() {},
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(`let miniWindow = null, miniReady = false, miniRendered = false, miniReadyTimer = null, miniUserHidden = true;
    let mainWindow = null, tray = null, playbackState = { hasTrack: ${hasTrack} };
    ${between("hideMiniPlayer", "showMainWindow")}
    ${between("broadcastPlayback", "positionMiniPlayer")}
    ${between("positionMiniPlayer", "thumbarIcon")}`, context);
  return { windows, errors, timers, call: (code) => vm.runInContext(code, context),
    rendered(window = windows.at(-1)) {
      context.renderEvent = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
      return vm.runInContext("markMiniPlayerRendered(renderEvent)", context);
    },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

{
  const h = harness(); h.call("broadcastPlayback()");
  assert.equal(h.windows.length, 0, "Playback/startup never creates a mini window");
  const empty = harness(false); empty.call("toggleMiniPlayer()");
  assert.equal(empty.windows.length, 0, "No empty controller without a track");
}
{
  const h = harness(); h.call("toggleMiniPlayer()");
  const w = h.windows[0]; assert.equal(w.visible, false, "Do not expose the blank loading window");
  w.loaded(); w.webContents.emit("did-finish-load"); await tick();
  assert.equal(w.visible, false, "Loaded HTML must still wait for its first frame");
  w.emit("ready-to-show"); assert.equal(w.visible, false, "A painted background is not a rendered controller");
  h.rendered(w); assert.equal(w.visible, true);
  assert.equal(h.timers.size, 0, "Rendered controls cancel the readiness deadline");
  assert(w.messages.some(([event]) => event === "heykasa:playback:state"));
  h.call("toggleMiniPlayer()"); assert.equal(w.visible, false);
  h.call("toggleMiniPlayer()"); assert.equal(w.visible, true);
  assert.equal(h.windows.length, 1, "Reuse the ready controller");
}
for (const cancel of ["toggleMiniPlayer()", "hideMiniPlayer()", "playbackState.hasTrack = false"]) {
  const h = harness(); h.call("toggleMiniPlayer()"); h.call(cancel);
  h.windows[0].emit("ready-to-show");
  h.rendered();
  assert.equal(h.windows[0].visible, false, `No delayed popup after ${cancel}`);
}
{
  const h = harness(); h.call("toggleMiniPlayer()");
  const old = h.windows[0]; old.destroy(); h.call("toggleMiniPlayer()");
  old.emit("ready-to-show"); old.emit("closed"); old.failed(new Error("old load cancelled"));
  await tick(); assert.equal(h.errors.length, 0);
  assert.equal(h.rendered(old), false, "Retired renderers cannot acknowledge a replacement window");
  h.windows[1].emit("ready-to-show"); h.rendered(); assert.equal(h.windows[1].visible, true, "Stale events cannot clear a replacement window");
}
for (const crash of [false, true]) {
  const h = harness(); h.call("toggleMiniPlayer()"); const w = h.windows[0];
  if (crash) { w.emit("ready-to-show"); w.webContents.emit("render-process-gone", {}, { reason: "crashed" }); }
  else w.failed(new Error("local controller file missing"));
  await tick(); assert.equal(w.destroyed, true); assert.equal(w.visible, false);
  assert.equal(h.errors.length, 1, "A failed controller gives an explicit error, not an empty window");
}
{
  const h = harness(); h.call("toggleMiniPlayer()"); h.call("hideMiniPlayer()");
  h.windows[0].failed(new Error("cancelled load")); await tick();
  assert.equal(h.errors.length, 0, "A cancelled controller does not interrupt the main app");
}
{
  const h = harness(); h.call("toggleMiniPlayer()"); const w = h.windows[0];
  h.rendered(); assert.equal(w.visible, false, "Controls must also wait for the first frame");
  w.emit("ready-to-show"); assert.equal(w.visible, true);
}
{
  const h = harness(); h.call("toggleMiniPlayer()"); const w = h.windows[0]; w.emit("ready-to-show");
  assert.equal(h.call("markMiniPlayerRendered({sender: {}, senderFrame: {}})"), false);
  assert.equal(h.call("markMiniPlayerRendered({sender: miniWindow.webContents, senderFrame: {}})"), false);
  assert.equal(w.visible, false, "Other windows and subframes cannot acknowledge rendered controls");
  assert.equal(h.timers.size, 1);
  for (const expire of [...h.timers.values()]) expire();
  assert.equal(w.destroyed, true); assert.equal(w.visible, false);
  assert.equal(h.errors.length, 1, "A stalled renderer produces an error instead of a blank controller");
}
console.log("PASS: opt-in startup, rendered controls and first-frame readiness, cancellation, reuse, stale windows, stalled rendering, file failure and renderer crash");
