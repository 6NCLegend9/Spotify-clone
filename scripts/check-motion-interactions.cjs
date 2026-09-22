// Optional component regression harness. See docs/motion-performance.md.
const fs = require("fs");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");
const path = require("node:path");
const rootPath = path.resolve(__dirname, "..");
const scratch = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "haykasa-motion-"));
const bundlePath = path.join(scratch, "bundle.cjs");
(async () => {
  await esbuild.build({ stdin: { contents: `export {default as BottomSheet} from '${rootPath}/src/components/BottomSheet.jsx'; export {default as QueueEditor} from '${rootPath}/src/components/MusicPlayer/QueueEditor.tsx'; export {default as MediaPresentation, positionMediaViewport} from '${rootPath}/src/components/MusicPlayer/MediaPresentation.tsx';`, resolveDir: __dirname }, bundle: true, platform: "node", format: "cjs", jsx: "automatic", outfile: bundlePath, plugins: [{ name: "stubs", setup(build) {
    build.onResolve({ filter: /^(react|react-dom|react\/jsx-runtime)$/ }, (a) => ({ path: require.resolve(a.path), external: true }));
    build.onResolve({ filter: /^@\/hooks\/useFocusTrap$/ }, () => ({ path: rootPath + "/src/hooks/useFocusTrap.js" }));
    build.onResolve({ filter: /\.module\.css$/ }, (a) => ({ path: a.path, namespace: "css" }));
    build.onLoad({ filter: /.*/, namespace: "css" }, () => ({ contents: "export default new Proxy({}, {get:(_,p)=>p});" }));
    build.onResolve({ filter: /^(next\/dynamic|next\/link|react-redux|lucide-react)$|^\.\/(PlayerDock|PlayerTimeline|SyncedLyrics)$/ }, (a) => ({ path: a.path, namespace: "mock" }));
    build.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({ contents: a.path === "react-redux" ? "exports.useSelector=(f)=>f({settings:{},player:{}});" : a.path === "next/dynamic" ? "module.exports=()=>()=>null;" : a.path === "next/link" ? `const React=require('react'); module.exports=({children,...p})=>React.createElement('a',p,children);` : a.path === "./PlayerDock" ? `const React=require('react'); exports.PlayerIconButton=({label,children,active,...p})=>React.createElement('button',{'aria-label':label,...p},children); exports.Transport=()=>null;` : a.path === "lucide-react" ? `module.exports=Object.fromEntries(${JSON.stringify(["GripVertical", "ListX", "Save", "Trash2", "Undo2", "ChevronDown", "ListMusic", "Maximize2", "Mic2", "Minimize2", "Music2", "Pause", "Play", "Settings2", "Video"])}.map(k=>[k,()=>null]));` : "module.exports=()=>null;" }));
  } }] });
  const dom = new JSDOM('<!doctype html><html><body><button id="trigger">Trigger</button><div id="root"></div></body></html>', { url: "https://example.test" });
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, CustomEvent: dom.window.CustomEvent, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true });
  window.HTMLElement.prototype.setPointerCapture = function(id) {
    this._pointer = id;
  };
  window.HTMLElement.prototype.hasPointerCapture = function(id) {
    return this._pointer === id;
  };
  window.HTMLElement.prototype.releasePointerCapture = function() {
    this._pointer = null;
  };
  let reduced = false;
  window.matchMedia = (q) => ({ matches: q.includes("prefers-reduced-motion") ? reduced : q.includes("max-width"), addEventListener() {
  }, removeEventListener() {
  } });
  const frames = /* @__PURE__ */ new Map();
  let seq = 0;
  global.requestAnimationFrame = window.requestAnimationFrame = (f) => {
    frames.set(++seq, f);
    return seq;
  };
  global.cancelAnimationFrame = window.cancelAnimationFrame = (id) => frames.delete(id);
  global.ResizeObserver = class {
    observe() {
    }
    disconnect() {
    }
  };
  const React = require("react");
  const { act } = React;
  const { createRoot } = require("react-dom/client");
  const { BottomSheet, QueueEditor, MediaPresentation, positionMediaViewport } = require(bundlePath);
  const root = createRoot(document.getElementById("root"));
  const h = React.createElement;
  const render = async (el) => act(async () => root.render(el));
  const tick = async () => act(async () => {
    const batch = [...frames.values()];
    frames.clear();
    for (const f of batch) f(performance.now());
  });
  const pointer = async (node, type, y, x = 20) => act(async () => {
    const e = new window.Event(type, { bubbles: true });
    Object.assign(e, { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0 });
    node.dispatchEvent(e);
  });
  const wait = async (ms) => act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
  let closed = 0;
  const sheet = (open) => h(BottomSheet, { open, label: "Test sheet", onClose: () => closed++ }, h("button", null, "Action"));
  document.getElementById("trigger").focus();
  await render(sheet(true));
  await tick();
  let panel = document.querySelector("[role=dialog]");
  let grip = panel.querySelector("[aria-hidden=true]");
  await pointer(grip, "pointerdown", 0);
  await pointer(grip, "pointermove", 180);
  await tick();
  await pointer(grip, "pointercancel", 180);
  assert.equal(closed, 0);
  assert.equal(panel.style.getPropertyValue("--sheet-offset"), "0px");
  await render(sheet(false));
  assert(document.querySelector("[data-state=closing]"));
  assert.equal(document.body.style.overflow, "hidden");
  await wait(260);
  assert.equal(document.querySelector("[role=dialog]"), null);
  assert.equal(document.body.style.overflow, "");
  assert.equal(document.activeElement.id, "trigger");
  await render(sheet(true));
  await render(sheet(false));
  await wait(50);
  await render(sheet(true));
  await wait(260);
  assert(document.querySelector("[role=dialog]"));
  await render(null);
  reduced = true;
  await render(sheet(true));
  await render(sheet(false));
  assert.equal(document.querySelector("[role=dialog]"), null);
  reduced = false;
  console.log("PASS sheet: cancelled drag, animated close, scroll/focus restoration, reopen race, reduced motion");
  const sheets = (a, b) => h(React.Fragment, null, h(BottomSheet, { open: a, label: "One" }, h("button", null, "One")), h(BottomSheet, { open: b, label: "Two" }, h("button", null, "Two")));
  document.getElementById("trigger").focus();
  await render(sheets(true, false));
  await tick();
  await render(sheets(false, true));
  await tick();
  await wait(260);
  assert.equal(document.body.style.overflow, "hidden");
  assert.equal(document.activeElement.textContent, "Two");
  await render(sheets(false, false));
  await wait(260);
  assert.equal(document.body.style.overflow, "");
  assert.equal(document.activeElement.id, "trigger");
  await render(null);
  console.log("PASS overlapping sheets retain focus and release scroll locks");
  const tracks = ["A", "B", "C"].map((title, i) => ({ id: String(i), queueEntryId: title, title, queueSource: "user" }));
  let edits = [];
  let commits = 0;
  const queue = (q = tracks) => h(React.Profiler, { id: "queue", onRender: () => commits++ }, h(QueueEditor, { queue: q, track: tracks[0], onSelect() {
  }, onQueueEdit: (e) => edits.push(e) }));
  let reads = 0;
  Object.defineProperty(window.HTMLElement.prototype, "offsetTop", { get() {
    return Number(this.dataset.queueIndex || 0) * 60;
  }, configurable: true });
  const oldRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function() {
    if (this.dataset.queueIndex) {
      reads++;
      const y = Number(this.dataset.queueIndex) * 60;
      return { left: 0, top: y, bottom: y + 60, right: 300, width: 300, height: 60 };
    }
    return oldRect.call(this);
  };
  await render(queue());
  let handle = document.querySelector('[aria-label="Drag B to reorder"]');
  await pointer(handle, "pointerdown", 75);
  await tick();
  const initialReads = reads, initialCommits = commits;
  for (let i = 0; i < 15; i++) {
    await pointer(handle, "pointermove", 76 + i * 0.1);
    await tick();
  }
  assert.equal(reads, initialReads);
  assert.equal(commits, initialCommits);
  await pointer(handle, "pointercancel", 180);
  assert.equal(edits.length, 0);
  await pointer(handle, "pointerdown", 75);
  await pointer(handle, "pointermove", 175);
  await pointer(handle, "pointerup", 175);
  assert.deepEqual(edits.pop(), { kind: "reorder", index: 1, toIndex: 2 });
  assert.equal(frames.size, 0);
  await pointer(handle, "pointerdown", 75);
  await render(queue([tracks[0], tracks[2], tracks[1]]));
  await pointer(handle, "pointerup", 175);
  assert.equal(edits.length, 0);
  await render(null);
  console.log("PASS queue: cached geometry and no React commits on same-slot motion; cancel, final drop, remote update");
  const host = document.createElement("div"), anchor = document.createElement("div"), clip = document.createElement("div");
  document.body.append(host, clip);
  clip.append(anchor);
  let log = [];
  host.style.left = "10px";
  host.style.top = "20px";
  host.getBoundingClientRect = () => {
    log.push("read");
    return { left: 30, top: 50 };
  };
  anchor.getBoundingClientRect = () => {
    log.push("read");
    return { left: 100, top: 100, right: 420, bottom: 280, width: 320, height: 180 };
  };
  anchor.getClientRects = () => [1];
  clip.getBoundingClientRect = () => {
    log.push("read");
    return { left: 0, top: 120, right: 500, bottom: 260 };
  };
  const set = host.style.setProperty.bind(host.style);
  host.style.setProperty = (...a) => {
    log.push("write");
    set(...a);
  };
  positionMediaViewport(host, anchor, true, false, [clip]);
  assert.equal(host.style.left, "80px");
  assert.equal(host.style.top, "70px");
  assert.equal(host.style.getPropertyValue("clip-path"), "inset(20px 0px 20px 0px)");
  assert(log.slice(log.indexOf("write")).every((x) => x === "write"));
  positionMediaViewport(host, anchor, false, false, [clip]);
  assert.equal(host.getAttribute("aria-hidden"), "true");
  assert.equal(host.inert, true);
  host.remove();
  clip.remove();
  console.log("PASS viewport: transformed origin, clipping, read-before-write ordering, hidden video");
  const region = document.createElement("div");
  region.className = "app-player";
  region.innerHTML = '<div class="player-dock"><div data-testid="youtube-decks"><iframe></iframe></div></div>';
  document.body.append(region);
  const original = region.querySelector("iframe");
  const ref = React.createRef();
  let mediaCommits = 0;
  const mediaProps = { ref, track: { id: "t", title: "Test" }, queue: [], position: 0, duration: 100, onQueue() {
  }, onVideo() {
  }, onNext() {
  }, onPrevious() {
  }, onPlayPause() {
  }, onSeek() {
  } };
  await render(h(React.Profiler, { id: "media", onRender: () => mediaCommits++ }, h(MediaPresentation, mediaProps)));
  await act(async () => ref.current.open());
  await wait(340);
  await tick();
  panel = document.querySelector("[data-testid=kasa-media-overlay]");
  const target = panel.querySelector("[data-sheet-handle]");
  const touch = async (type, y) => act(async () => {
    const e = new window.Event(type, { bubbles: true });
    Object.assign(e, { touches: type === "touchend" ? [] : [{ clientX: 20, clientY: y }], changedTouches: [{ clientX: 20, clientY: y }] });
    target.dispatchEvent(e);
  });
  await touch("touchstart", 0);
  const before = mediaCommits;
  for (let y = 20; y < 100; y += 10) {
    await touch("touchmove", y);
    await tick();
  }
  assert.equal(mediaCommits, before);
  assert(Number.parseFloat(panel.style.getPropertyValue("--sheet-drag")) > 0);
  await touch("touchcancel", 90);
  await tick();
  assert.equal(panel.style.getPropertyValue("--sheet-drag"), "0px");
  assert.equal(region.querySelector("iframe"), original);
  assert(frames.size <= 1);
  await act(async () => ref.current.dismiss());
  await render(null);
  assert.equal(frames.size, 0);
  region.remove();
  console.log("PASS player: ref-driven drag, cancellation, single pending frame, preserved iframe, cleanup");
  await act(async () => root.unmount());
  dom.window.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => fs.rmSync(scratch, { recursive: true, force: true }));
