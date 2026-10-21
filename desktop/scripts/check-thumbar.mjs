import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { app, BrowserWindow, nativeImage } from "electron";

const output = path.resolve("artifacts/desktop-thumbar");
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "haykasa-thumbar-")));
const report = { platform: process.platform, icons: [], states: [], commands: [], passed: false };
let window;

app.whenReady().then(async () => {
try {
  assert.equal(process.platform, "win32", "Run the native thumbnail-toolbar check on Windows");
  const directory = fileURLToPath(new URL("../src/", import.meta.url));
  const source = fs.readFileSync(path.join(directory, "main.mjs"), "utf8");
  const start = source.indexOf("function thumbarIcon(");
  const end = source.indexOf("function assertMiniOrTrustedIpcEvent(", start);
  assert(start >= 0 && end > start);
  let buttons;
  const context = vm.createContext({
    nativeImage, path, __dirname: directory, process: { platform: "win32" },
    sendPlaybackCommand: command => report.commands.push(command),
    qaWindow: { isDestroyed: () => false, setThumbarButtons: value => { buttons = value; } },
  });
  vm.runInContext(`let mainWindow = qaWindow; let playbackState = {}; ${source.slice(start, end)}`, context);
  const digest = image => crypto.createHash("sha256").update(image.toPNG()).digest("hex");
  const digests = new Set();
  for (const kind of ["previous", "play", "pause", "next"]) {
    const image = context.thumbarIcon(kind);
    assert.equal(image.isEmpty(), false, `${kind}: the actual Windows decoder must load the icon`);
    assert.deepEqual(image.getSize(), { width: 16, height: 16 });
    const pixels = image.toBitmap({ scaleFactor: 1 });
    assert.equal(pixels.length, 16 * 16 * 4);
    let visible = 0, transparent = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3]) visible++;
      else transparent++;
    }
    assert(visible > 0 && transparent > 0, `${kind}: a visible glyph on a transparent background`);
    const highDpi = nativeImage.createFromPath(path.join(directory, "icons", "thumbar", `${kind}@2x.png`));
    assert.equal(highDpi.isEmpty(), false, `${kind}: high-DPI companion decodes`);
    digests.add(digest(image));
    fs.writeFileSync(path.join(output, `${kind}.png`), image.toPNG());
    report.icons.push({ kind, size: image.getSize(), scaleFactors: image.getScaleFactors(), visible, transparent });
  }
  assert.equal(digests.size, 4, "Previous, Play, Pause and Next have distinct images");
  const legacySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="white" d="M5 3.5v9l8-4.5-8-4.5Z"/></svg>';
  report.legacySvgEmpty = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(legacySvg)}`).isEmpty();

  window = new BrowserWindow({ width: 640, height: 360, title: "HayKasa taskbar controls QA", show: false,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
  await window.loadURL("data:text/html,<title>HayKasa taskbar controls QA</title><p>Native thumbnail-toolbar verification</p>");
  window.show();
  for (const state of [
    { name: "paused", playing: false, canPrev: true, canPlay: true, canSkip: true },
    { name: "playing", playing: true, canPrev: true, canPlay: true, canSkip: true },
    { name: "empty", playing: false, canPrev: false, canPlay: false, canSkip: false },
  ]) {
    context.nextState = state;
    vm.runInContext("playbackState = nextState; updateThumbar()", context);
    assert.equal(buttons.length, 3);
    assert.deepEqual(Array.from(buttons, button => button.tooltip), ["Previous", state.playing ? "Pause" : "Play", "Next"]);
    for (const [index, kind] of ["previous", state.playing ? "pause" : "play", "next"].entries()) {
      assert.equal(digest(buttons[index].icon), digest(context.thumbarIcon(kind)));
      assert.deepEqual(Array.from(buttons[index].flags), state.name === "empty" ? ["disabled"] : []);
    }
    assert.equal(window.setThumbarButtons(Array.from(buttons)), true, `${state.name}: Windows accepts the native toolbar`);
    if (state.name !== "empty") for (const button of buttons) button.click();
    report.states.push({ name: state.name, tooltips: Array.from(buttons, button => button.tooltip), nativeToolbarAccepted: true });
  }
  assert.deepEqual(report.commands, ["prev", "play-pause", "skip", "prev", "play-pause", "skip"]);
  report.passed = true;
  console.log("PASS: Windows decodes four distinct transport icons, accepts thumbnail toolbars, switches Play/Pause and preserves commands/disabled states");
} catch (error) {
  report.error = error.stack || error.message;
  console.error(report.error);
} finally {
  window?.destroy();
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(report, null, 2));
  app.exit(report.passed ? 0 : 1);
}
});
